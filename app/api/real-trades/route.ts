import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getSimulatedPrice,
  MARKET_SYMBOLS
} from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS = Object.keys(MARKET_SYMBOLS);
const DURATIONS = [1, 5, 10, 15, 30, 60, 86400];
const PAYOUT = 1.8;

type ContractType =
  | "DIRECTIONAL"
  | "EVEN_ODD"
  | "OVER_UNDER"
  | "MATCHES_DIFFERS";

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

  return Number(
    formatted.replace(".", "").slice(-1)
  );
}

function isWinning(
  contractType: ContractType,
  prediction: string,
  entryPrice: number,
  currentPrice: number,
  entryDigit: number | null,
  currentDigit: number
) {
  switch (contractType) {
    case "DIRECTIONAL":
      return prediction === "CALL"
        ? currentPrice > entryPrice
        : prediction === "PUT"
          ? currentPrice < entryPrice
          : false;

    case "EVEN_ODD":
      return prediction === "EVEN"
        ? currentDigit % 2 === 0
        : prediction === "ODD"
          ? currentDigit % 2 !== 0
          : false;

    case "OVER_UNDER":
      if (entryDigit === null) return false;

      return prediction === "OVER"
        ? currentDigit > entryDigit
        : prediction === "UNDER"
          ? currentDigit < entryDigit
          : false;

    case "MATCHES_DIFFERS":
      if (entryDigit === null) return false;

      return prediction === "MATCHES"
        ? currentDigit === entryDigit
        : prediction === "DIFFERS"
          ? currentDigit !== entryDigit
          : false;

    default:
      return false;
  }
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return error("Please log in again.", 401);
  }

  const requestedLimit = Number(
    request.nextUrl.searchParams.get("limit") || 50
  );

  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;

  try {
    const result = await db.query(
      `SELECT *
       FROM (
         SELECT
           id,
           asset,
           contract_type,
           direction,
           amount,
           currency,
           expiry_seconds,
           entry_digit,
           expiry_digit,
           status,
           payout,
           profit,
           created_at,
           settled_at,
           FALSE AS simulation_only
         FROM real_trades
         WHERE user_id = $1

         UNION ALL

         SELECT
           id,
           asset,
           contract_type,
           direction,
           amount,
           currency,
           expiry_seconds,
           entry_digit,
           exit_digit AS expiry_digit,
           status,
           cash_out_amount AS payout,
           net_result AS profit,
           created_at,
           settled_at,
           TRUE AS simulation_only
         FROM real_mode_simulated_trades
         WHERE user_id = $1
       ) AS combined_trades
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return NextResponse.json(
      { trades: result.rows },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (err) {
    console.error("REAL trades history error:", err);

    return error("Could not load REAL trade history.", 500);
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return error("Please log in again.", 401);
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return error("Invalid request body.");
  }

  /*
   * CASH OUT
   *
   * This closes a simulated position only.
   * It never credits real_wallets or creates
   * a real-money transaction.
   */
  if (body.action === "CASH_OUT") {
    const tradeId = String(body.tradeId || "").trim();

    if (!tradeId) {
      return error("Select a position to cash out.");
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const locked = await client.query(
        `SELECT
           id,
           asset,
           contract_type,
           direction,
           amount,
           expiry_seconds,
           entry_price,
           entry_digit,
           created_at
         FROM real_mode_simulated_trades
         WHERE id::text = $1
           AND user_id = $2
           AND status = 'OPEN'
         FOR UPDATE`,
        [tradeId, userId]
      );

      const trade = locked.rows[0];

      if (!trade) {
        await client.query("ROLLBACK");

        return error(
          "This position is no longer active.",
          409
        );
      }

      const now = Date.now();
      const createdAt = new Date(trade.created_at).getTime();
      const durationMs =
        Number(trade.expiry_seconds) * 1000;

      if (
        !Number.isFinite(createdAt) ||
        !Number.isFinite(durationMs) ||
        durationMs <= 0
      ) {
        throw new Error("Invalid position timing.");
      }

      const expiryAt = createdAt + durationMs;

      if (now >= expiryAt) {
        const exitPrice = getSimulatedPrice(
          trade.asset,
          expiryAt
        );

        const exitDigit = getPriceDigit(
          trade.asset,
          exitPrice
        );

        await client.query(
          `UPDATE real_mode_simulated_trades
           SET status = 'EXPIRED',
               exit_price = $3,
               exit_digit = $4,
               settled_at = NOW()
           WHERE id = $1
             AND user_id = $2
             AND status = 'OPEN'`,
          [
            trade.id,
            userId,
            exitPrice,
            exitDigit
          ]
        );

        await client.query("COMMIT");

        return error(
          "This position has expired. Its simulated result is now closed.",
          409
        );
      }

      const stake = Number(trade.amount);
      const entryPrice = Number(trade.entry_price);

      if (
        !Number.isFinite(stake) ||
        stake <= 0 ||
        !Number.isFinite(entryPrice)
      ) {
        throw new Error("Invalid position values.");
      }

      const currentPrice = getSimulatedPrice(
        trade.asset,
        now
      );

      const currentDigit = getPriceDigit(
        trade.asset,
        currentPrice
      );

      const entryDigit =
        trade.entry_digit === null
          ? null
          : Number(trade.entry_digit);

      const contractType =
        trade.contract_type as ContractType;

      const prediction = String(trade.direction);

      const winningNow = isWinning(
        contractType,
        prediction,
        entryPrice,
        currentPrice,
        entryDigit,
        currentDigit
      );

      const elapsedFraction = Math.max(
        0,
        Math.min(1, (now - createdAt) / durationMs)
      );

      const rawValue = winningNow
        ? stake * (
            1 + (PAYOUT - 1) * elapsedFraction
          )
        : stake * (1 - elapsedFraction);

      const cashOutAmount = Math.max(
        0.01,
        Math.round(rawValue * 100) / 100
      );

      const netResult =
        Math.round(
          (cashOutAmount - stake) * 100
        ) / 100;

      await client.query(
        `UPDATE real_mode_simulated_trades
         SET status = 'CASHED_OUT',
             cash_out_amount = $3,
             net_result = $4,
             exit_price = $5,
             exit_digit = $6,
             settled_at = NOW()
         WHERE id = $1
           AND user_id = $2
           AND status = 'OPEN'`,
        [
          trade.id,
          userId,
          cashOutAmount.toFixed(2),
          netResult.toFixed(2),
          currentPrice,
          currentDigit
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        message:
          "Simulated position closed successfully. No real wallet was credited.",
        tradeId: trade.id,
        status: "CASHED_OUT",
        cashOutAmount,
        netResult,
        exitPrice: currentPrice,
        exitDigit: currentDigit,
        simulationOnly: true,
        walletCredited: false
      });
    } catch (err) {
      await client.query("ROLLBACK");

      console.error("REAL simulated cash-out error:", err);

      return error(
        "Could not close the simulated position.",
        500
      );
    } finally {
      client.release();
    }
  }

  /*
   * OPEN A SIMULATED REAL-MODE POSITION
   */
  if (body.action !== "OPEN") {
    return error("Unsupported trade action.");
  }

  const asset = String(body.asset || "");
  const contractType =
    String(body.contractType || "") as ContractType;
  const prediction = String(body.prediction || "");
  const amount = Number(body.amount);
  const expiry = Number(body.expirySeconds);

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
    return error("Stake must be between KES 1 and KES 100.");
  }

  if (!DURATIONS.includes(expiry)) {
    return error("Invalid trade duration.");
  }

  const validPredictions: Record<string, string[]> = {
    DIRECTIONAL: ["CALL", "PUT"],
    EVEN_ODD: ["EVEN", "ODD"],
    OVER_UNDER: ["OVER", "UNDER"],
    MATCHES_DIFFERS: ["MATCHES", "DIFFERS"]
  };

  if (
    !validPredictions[contractType]?.includes(prediction)
  ) {
    return error("Invalid trade prediction.");
  }

  if (
    ["OVER_UNDER", "MATCHES_DIFFERS"].includes(
      contractType
    ) &&
    (
      !Number.isInteger(selectedDigit) ||
      selectedDigit === null ||
      selectedDigit < 0 ||
      selectedDigit > 9
    )
  ) {
    return error("Select a digit from 0 to 9.");
  }

  let entryPrice: number;

  try {
    entryPrice = getSimulatedPrice(asset);
  } catch {
    return error("Simulated market price unavailable.", 503);
  }

  const entryDigit = getPriceDigit(
    asset,
    entryPrice
  );

  const idempotencyKey = randomUUID();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    /*
     * Serialize opening requests for this user.
     */
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [userId]
    );

    /*
     * Enforce one active position across:
     * DEMO, legacy REAL, and simulated REAL.
     */
    const active = await client.query(
      `SELECT
         (
           SELECT COUNT(*)
           FROM demo_trades
           WHERE user_id = $1
             AND status = 'PENDING'
         )
         +
         (
           SELECT COUNT(*)
           FROM real_trades
           WHERE user_id = $1
             AND status = 'OPEN'
         )
         +
         (
           SELECT COUNT(*)
           FROM real_mode_simulated_trades
           WHERE user_id = $1
             AND status = 'OPEN'
         ) AS active_count`,
      [userId]
    );

    if (
      Number(active.rows[0]?.active_count || 0) > 0
    ) {
      await client.query("ROLLBACK");

      return error(
        "You already have an active position. Close it before opening another.",
        409
      );
    }

    const result = await client.query(
      `INSERT INTO real_mode_simulated_trades (
         user_id,
         asset,
         contract_type,
         direction,
         amount,
         currency,
         expiry_seconds,
         entry_price,
         entry_digit,
         status,
         idempotency_key
       )
       VALUES (
         $1, $2, $3, $4, $5, 'KES',
         $6, $7, $8, 'OPEN', $9
       )
       RETURNING
         id,
         asset,
         contract_type,
         direction,
         amount,
         currency,
         expiry_seconds,
         entry_price,
         entry_digit,
         status,
         created_at`,
      [
        userId,
        asset,
        contractType,
        prediction,
        amount.toFixed(2),
        expiry,
        entryPrice,
        selectedDigit ?? entryDigit,
        idempotencyKey
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        message: "Simulated position opened.",
        trade: result.rows[0],
        simulationOnly: true,
        walletDebited: false,
        walletCredited: false
      },
      { status: 201 }
    );
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("REAL simulated trade error:", err);

    return error(
      "Could not open the simulated position.",
      500
    );
  } finally {
    client.release();
  }
}
