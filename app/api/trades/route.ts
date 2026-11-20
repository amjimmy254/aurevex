
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMarketSeries, MARKET_SYMBOLS } from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS = Object.keys(MARKET_SYMBOLS);
const DURATIONS = [1];
const PAYOUT = 1.952;
const TEST_SIMULATION = true;

function getTestWinRate(email: string): number {
  return email.toLowerCase() === "jimmy@gmail.com"
    ? 80
    : 20;
}
function generateTestOutcome(winRate: number): boolean {
  return randomInt(100) < winRate;
}

type ContractType =
  | "DIRECTIONAL"
  | "EVEN_ODD"
  | "OVER_UNDER"
  | "MATCHES_DIFFERS";

async function getUser(request: NextRequest): Promise<string | null> {
  return getAuthenticatedUserId(request);
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getPriceDigit(asset: string, price: number) {
  const decimals =
    asset === "USD/JPY"
      ? 3
      : ["EUR/USD", "GBP/USD"].includes(asset)
        ? 5
        : 2;

  const formatted = price.toFixed(decimals);
  return Number(formatted.replace(".", "").slice(-1));
}

async function settleExpired(userId: string) {
  const accountResult = await db.query(
  `SELECT email FROM app_users WHERE id = $1 LIMIT 1`,
  [userId]
);

const accountEmail = String(
  accountResult.rows[0]?.email || ""
).toLowerCase();
  const expired = await db.query(
    `SELECT id, asset
     FROM demo_trades
     WHERE user_id = $1
       AND status = 'PENDING'
       AND entry_price IS NOT NULL
       AND created_at + expiry_seconds * INTERVAL '1 second' <= NOW()
     ORDER BY created_at ASC`,
    [userId]
  );

  for (const trade of expired.rows) {
    let expiryPrice: number;

    try {
      const market = await getMarketSeries(trade.asset);
      expiryPrice = market.price;
    } catch {
      continue;
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const locked = await client.query(
        `SELECT *
         FROM demo_trades
         WHERE id = $1
           AND user_id = $2
           AND status = 'PENDING'
         FOR UPDATE`,
        [trade.id, userId]
      );

      if (!locked.rows[0]) {
        await client.query("COMMIT");
        continue;
      }

      const current = locked.rows[0];

      if (current.entry_price === null) {
        await client.query("COMMIT");
        continue;
      }

      const entry = Number(current.entry_price);
      const stake = Number(current.amount);

      const target =
        current.target_price === null
          ? null
          : Number(current.target_price);

      const expiryDigit = getPriceDigit(
        current.asset,
        expiryPrice
      );

      let won = false;
      let draw = false;

      switch (current.contract_type) {
        case "DIRECTIONAL":
          won =
            current.direction === "CALL"
              ? expiryPrice > entry
              : expiryPrice < entry;

          draw = expiryPrice === entry;
          break;

        case "EVEN_ODD":
          won =
            current.contract_prediction === "EVEN"
              ? expiryDigit % 2 === 0
              : expiryDigit % 2 !== 0;
          break;

        case "OVER_UNDER":
          won =
            current.contract_prediction === "OVER"
              ? expiryPrice > target!
              : expiryPrice < target!;

          draw = expiryPrice === target;
          break;

        case "MATCHES_DIFFERS":
          won =
            current.contract_prediction === "MATCHES"
              ? expiryDigit === Number(current.entry_digit)
              : expiryDigit !== Number(current.entry_digit);
          break;
      }
      if (TEST_SIMULATION) {
        won = generateTestOutcome(getTestWinRate(accountEmail));
        draw = false;
      }

      // Refund the virtual stake on a tie.
      if (draw) {
        await client.query(
          `UPDATE demo_wallets
           SET virtual_balance = virtual_balance + $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId, stake.toFixed(2)]
        );

        await client.query(
          `INSERT INTO demo_transactions
           (user_id, wallet_type, transaction_type, amount, note)
           VALUES ($1, 'MAIN', 'DEMO_CREDIT', $2, $3)`,
          [
            userId,
            stake.toFixed(2),
            "Demo trade refund - price tie"
          ]
        );

        await client.query(
          `UPDATE demo_trades
           SET status = 'CANCELLED',
               simulated_result = 0,
               expiry_price = $2,
               expiry_digit = $3,
               settled_at = NOW()
           WHERE id = $1`,
          [current.id, expiryPrice, expiryDigit]
        );
      }

      // Winning demo trade.
      else if (won) {
        const returned = (stake * PAYOUT).toFixed(2);
        const profit = (stake * (PAYOUT - 1)).toFixed(2);

        await client.query(
          `UPDATE demo_wallets
           SET virtual_balance = virtual_balance + $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId, returned]
        );

        await client.query(
          `INSERT INTO demo_transactions
           (user_id, wallet_type, transaction_type, amount, note)
           VALUES ($1, 'MAIN', 'DEMO_CREDIT', $2, $3)`,
          [
            userId,
            returned,
            "Demo contract payout"
          ]
        );

        await client.query(
          `UPDATE demo_trades
           SET status = 'WON',
               simulated_result = $2,
               expiry_price = $3,
               expiry_digit = $4,
               settled_at = NOW()
           WHERE id = $1`,
          [current.id, profit, expiryPrice, expiryDigit]
        );
      }

      // Losing demo trade.
      else {
        await client.query(
          `UPDATE demo_trades
           SET status = 'LOST',
               simulated_result = $2,
               expiry_price = $3,
               expiry_digit = $4,
               settled_at = NOW()
           WHERE id = $1`,
          [
            current.id,
            stake.toFixed(2),
            expiryPrice,
            expiryDigit
          ]
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("Trade settlement error:", e);
    } finally {
      client.release();
    }
  }
}

export async function GET(request: NextRequest) {
  const userId = await getUser(request);

  if (!userId) {
    return error("Please log in again.", 401);
  }

  try {
    await settleExpired(userId);

    const result = await db.query(
      `SELECT id, asset, direction, amount,
       expiry_seconds, status, simulated_result,
       created_at, settled_at, contract_type,
       contract_prediction, target_price,
       entry_price, expiry_price, entry_digit,
       expiry_digit
       FROM demo_trades
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return NextResponse.json(
      { trades: result.rows },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (e) {
    console.error("Trade history error:", e);
    return error("Could not load trades.", 500);
  }
}

export async function POST(request: NextRequest) {
  const userId = await getUser(request);

  if (!userId) {
    return error("Please log in again.", 401);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return error("Invalid request.");
  }

  const asset = body.asset;
  const contractType = body.contractType as ContractType;
  const prediction = String(body.prediction || "");
  const amount = Number(body.amount);
  const expiry = Number(body.expirySeconds);

  const targetPrice =
    body.targetPrice == null
      ? null
      : Number(body.targetPrice);

  const selectedDigit =
    body.selectedDigit == null
      ? null
      : Number(body.selectedDigit);

  if (!ASSETS.includes(asset)) {
    return error("Invalid trading asset.");
  }

  if (
    ![
      "DIRECTIONAL",
      "EVEN_ODD",
      "OVER_UNDER",
      "MATCHES_DIFFERS"
    ].includes(contractType)
  ) {
    return error("Invalid contract type.");
  }

  if (
    !Number.isFinite(amount) ||
    amount < 1 ||
    amount > 100 ||
    Math.round(amount * 100) !== amount * 100
  ) {
    return error("Stake must be $1-$100.");
  }

  if (!DURATIONS.includes(expiry)) {
    return error("Expiry must be 1 second.");
  }

  if (
    contractType === "DIRECTIONAL" &&
    !["CALL", "PUT"].includes(prediction)
  ) {
    return error("Choose CALL or PUT.");
  }

  if (
    contractType === "EVEN_ODD" &&
    !["EVEN", "ODD"].includes(prediction)
  ) {
    return error("Choose EVEN or ODD.");
  }

  if (contractType === "OVER_UNDER") {
    if (!["OVER", "UNDER"].includes(prediction)) {
      return error("Choose OVER or UNDER.");
    }

    if (
      !Number.isFinite(targetPrice) ||
      targetPrice! <= 0
    ) {
      return error("Enter a valid target price.");
    }
  }

  if (contractType === "MATCHES_DIFFERS") {
    if (!["MATCHES", "DIFFERS"].includes(prediction)) {
      return error("Choose MATCHES or DIFFERS.");
    }

    if (
      !Number.isInteger(selectedDigit) ||
      selectedDigit! < 0 ||
      selectedDigit! > 9
    ) {
      return error("Select a digit from 0 to 9.");
    }
  }

  let market;

  try {
    market = await getMarketSeries(asset);
  } catch {
    return error(
      "Market data unavailable. Trade not placed.",
      503
    );
  }

  const entryPrice = market.price;
  const entryDigit = getPriceDigit(asset, entryPrice);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const wallet = await client.query(
      `SELECT virtual_balance
       FROM demo_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (!wallet.rows[0]) {
      await client.query("ROLLBACK");
      return error("Wallet not found.", 404);
    }

    if (
      Number(wallet.rows[0].virtual_balance) < amount
    ) {
      await client.query("ROLLBACK");
      return error("Insufficient demo balance.");
    }

    await client.query(
      `UPDATE demo_wallets
       SET virtual_balance = virtual_balance - $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, amount.toFixed(2)]
    );

    const result = await client.query(
      `INSERT INTO demo_trades
       (user_id, asset, direction, amount,
        expiry_seconds, status, simulated_result,
        contract_type, contract_prediction,
        target_price, entry_price, entry_digit,
        provider_symbol)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 0,
               $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        asset,
        prediction,
        amount.toFixed(2),
        expiry,
        contractType,
        prediction,
        targetPrice,
        entryPrice,
        selectedDigit,
        market.providerSymbol
      ]
    );

    await client.query(
      `INSERT INTO demo_transactions
       (user_id, wallet_type, transaction_type, amount, note)
       VALUES ($1, 'MAIN', 'DEMO_DEBIT', $2, $3)`,
      [
        userId,
        amount.toFixed(2),
        `Demo ${contractType} contract stake`
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        message: "Demo contract placed.",
        trade: result.rows[0]
      },
      { status: 201 }
    );
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Trade placement error:", e);
    return error("Could not place trade.", 500);
  } finally {
    client.release();
  }
}
