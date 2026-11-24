
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getMarketSeries,
  getSimulatedPrice,
  MARKET_SYMBOLS
} from "@/lib/market-data";
import { getHourlyEvent } from "@/lib/hourly-event";
import { isThreeHourEventActive } from "@/lib/three-hour-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS = Object.keys(MARKET_SYMBOLS);
const DURATIONS = [1, 5, 10, 15, 30, 60, 86400];
const PAYOUT = 1.8;
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
type DemoTradeCashOutRow = {
  id: string;
  asset: string;
  amount: number | string;
  expiry_seconds: number | string;
  created_at: string | Date;
  contract_type: ContractType;
  contract_prediction: string | null;
  direction: string;
  entry_price: number | string | null;
  entry_digit: number | null;
};

function getDemoCashOutQuote(
  trade: DemoTradeCashOutRow,
  now: number
) {
  const createdAt = new Date(trade.created_at).getTime();
  const durationMs = Number(trade.expiry_seconds) * 1000;
  const stake = Number(trade.amount);

  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(stake) ||
    stake <= 0
  ) {
    throw new Error("Invalid trade data.");
  }

  const expiryAt = createdAt + durationMs;

  if (now >= expiryAt) {
    throw new Error("Trade has expired.");
  }

  const currentPrice = getSimulatedPrice(trade.asset, now);
  const currentDigit = getPriceDigit(trade.asset, currentPrice);
  const prediction = trade.contract_prediction || trade.direction;

  let winningNow = false;

  switch (trade.contract_type) {
    case "DIRECTIONAL": {
      const entry = Number(trade.entry_price);

      if (!Number.isFinite(entry)) {
        throw new Error("Invalid entry price.");
      }

      winningNow =
        prediction === "CALL"
          ? currentPrice > entry
          : prediction === "PUT"
            ? currentPrice < entry
            : false;
      break;
    }

    case "EVEN_ODD":
      winningNow =
        prediction === "EVEN"
          ? currentDigit % 2 === 0
          : prediction === "ODD"
            ? currentDigit % 2 !== 0
            : false;
      break;

    case "OVER_UNDER":
      if (trade.entry_digit === null) {
        throw new Error("Missing selected digit.");
      }

      winningNow =
        prediction === "OVER"
          ? currentDigit > trade.entry_digit
          : prediction === "UNDER"
            ? currentDigit < trade.entry_digit
            : false;
      break;

    case "MATCHES_DIFFERS":
      if (trade.entry_digit === null) {
        throw new Error("Missing selected digit.");
      }

      winningNow =
        prediction === "MATCHES"
          ? currentDigit === trade.entry_digit
          : prediction === "DIFFERS"
            ? currentDigit !== trade.entry_digit
            : false;
      break;
  }

  const elapsedFraction = Math.max(
    0,
    Math.min(1, (now - createdAt) / durationMs)
  );

  const rawValue = winningNow
    ? stake * (1 + (PAYOUT - 1) * elapsedFraction)
    : stake * (1 - elapsedFraction);

  const cashOutAmount = Math.max(
    0.01,
    Math.round(rawValue * 100) / 100
  );

  return {
    currentPrice,
    currentDigit,
    cashOutAmount,
    netResult: Math.round((cashOutAmount - stake) * 100) / 100
  };
}

async function settleExpired(
  userId: string,
  force = false,
  tradeId?: string
) {
  const accountResult = await db.query(
  `SELECT email FROM app_users WHERE id = $1 LIMIT 1`,
  [userId]
);

const accountEmail = String(
  accountResult.rows[0]?.email || ""
).toLowerCase();
  const expired = await db.query(
    `SELECT id, asset, created_at, expiry_seconds, contract_type
     FROM demo_trades
     WHERE user_id = $1
       AND status = 'PENDING'
       AND entry_price IS NOT NULL
       AND ($2::boolean = TRUE OR created_at + expiry_seconds * INTERVAL '1 second' <= NOW())
       AND ($3::text IS NULL OR id::text = $3::text)
     ORDER BY created_at ASC`,
    [userId, force, tradeId ?? null]
  );

  for (const trade of expired.rows) {
    let expiryPrice: number;

    try {
  if (trade.contract_type === "OVER_UNDER") {
    const expiryTime = force
      ? Date.now()
      : new Date(trade.created_at).getTime() +
        Number(trade.expiry_seconds) * 1000;

    expiryPrice = getSimulatedPrice(
      trade.asset,
      expiryTime
    );
  } else {
    const market = await getMarketSeries(trade.asset);
    expiryPrice = market.price;
  }
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
      ? expiryDigit > Number(current.entry_digit)
      : expiryDigit < Number(current.entry_digit);

  draw = expiryDigit === Number(current.entry_digit);
  break;

        case "MATCHES_DIFFERS":
          won =
            current.contract_prediction === "MATCHES"
              ? expiryDigit === Number(current.entry_digit)
              : expiryDigit !== Number(current.entry_digit);
          break;
      }
  if (
  TEST_SIMULATION &&
  !force
) {
  let hourlyEventActive = false;
  let threeHourEventActive = false;

  try {
    hourlyEventActive = getHourlyEvent().active;
    threeHourEventActive = isThreeHourEventActive();
  } catch (eventError) {
    console.error("Demo event unavailable:", eventError);
  }

  // Check the five most recently settled demo trades.
  const recentTrades = await client.query(
    `SELECT status, settled_at
     FROM demo_trades
     WHERE user_id = $1
       AND status IN ('WON', 'LOST', 'CANCELLED')
     ORDER BY settled_at DESC
     LIMIT 5`,
    [userId]
  );

  const fiveConsecutiveLosses =
    recentTrades.rows.length === 5 &&
    recentTrades.rows.every(
      (trade: { status: string }) => trade.status === "LOST"
    );

  const fifthLossTime = fiveConsecutiveLosses
    ? new Date(recentTrades.rows[0].settled_at).getTime()
    : 0;

  const recoveryActive =
    fiveConsecutiveLosses &&
    Number.isFinite(fifthLossTime) &&
    Date.now() >= fifthLossTime &&
    Date.now() - fifthLossTime < 30_000;

  const winRate = threeHourEventActive
    ? 60
    : hourlyEventActive
      ? 37
      : recoveryActive
        ? 45
        : getTestWinRate(accountEmail);

  won = generateTestOutcome(winRate);
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

  if (body.action === "CASH_OUT") {
    const tradeId = String(body.tradeId || "").trim();

    if (!tradeId) {
      return error("Select a trade to cash out.");
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const locked = await client.query(
        `SELECT id, asset, amount, expiry_seconds,
                created_at, contract_type, contract_prediction,
                direction, entry_price, entry_digit
         FROM demo_trades
         WHERE id::text = $1
           AND user_id = $2
           AND status = 'PENDING'
         FOR UPDATE`,
        [tradeId, userId]
      );

      const trade = locked.rows[0];

      if (!trade) {
        await client.query("ROLLBACK");
        return error("This trade is no longer active.", 409);
      }

      const now = Date.now();

      let quote;

      try {
        quote = getDemoCashOutQuote(trade, now);
      } catch (quoteError: any) {
        await client.query("ROLLBACK");

        if (quoteError.message === "Trade has expired.") {
          await settleExpired(userId, false, tradeId);

          return error(
            "This trade has expired. Its normal result has been processed.",
            409
          );
        }

        return error(quoteError.message || "Could not value this trade.");
      }

      const credit = quote.cashOutAmount.toFixed(2);

      const wallet = await client.query(
        `UPDATE demo_wallets
         SET virtual_balance = virtual_balance + $2,
             updated_at = NOW()
         WHERE user_id = $1
         RETURNING virtual_balance`,
        [userId, credit]
      );

      if (!wallet.rows[0]) {
        throw new Error("Demo wallet not found.");
      }

      await client.query(
        `INSERT INTO demo_transactions
         (user_id, wallet_type, transaction_type, amount, note)
         VALUES ($1, 'MAIN', 'DEMO_CREDIT', $2, $3)`,
        [
          userId,
          credit,
          `Demo trade cash out - ${trade.contract_type}`
        ]
      );

      await client.query(
        `UPDATE demo_trades
         SET status = 'CASHED_OUT',
             simulated_result = $2,
             expiry_price = $3,
             expiry_digit = $4,
             settled_at = NOW()
         WHERE id = $1
           AND user_id = $5
           AND status = 'PENDING'`,
        [
          trade.id,
          quote.netResult.toFixed(2),
          quote.currentPrice,
          quote.currentDigit,
          userId
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        message: "Demo trade cashed out successfully.",
        cashOutAmount: Number(credit),
        netResult: quote.netResult,
        walletBalance: Number(wallet.rows[0].virtual_balance)
      });
    } catch (cashOutError) {
      await client.query("ROLLBACK");
      console.error("Demo cash-out error:", cashOutError);

      return error("Cash out failed. Your demo wallet was not credited.", 500);
    } finally {
      client.release();
    }
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
    return error("Invalid trade duration.");
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
    !Number.isInteger(selectedDigit) ||
    selectedDigit! < 0 ||
    selectedDigit! > 9
  ) {
    return error("Select a digit from 0 to 9.");
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
    // Serialize trade placement requests for this user.
    // This prevents two simultaneous requests from opening trades.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [userId]
    );

    // Check both demo and real accounts before allowing another trade.
   const activeTrades = await client.query(
  `SELECT
     (SELECT COUNT(*) FROM demo_trades
      WHERE user_id = $1 AND status = 'PENDING')
     +
     (SELECT COUNT(*) FROM real_trades
      WHERE user_id = $1 AND status = 'OPEN')
     +
     (SELECT COUNT(*) FROM real_mode_simulated_trades
      WHERE user_id = $1 AND status = 'OPEN')
     AS active_count`,
  [userId]
);

    if (Number(activeTrades.rows[0]?.active_count || 0) > 0) {
      await client.query("ROLLBACK");
      return error(
        "You already have an active trade. Close it before opening another.",
        409
      );
    }

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

