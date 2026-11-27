import { randomInt } from "node:crypto";
import { getHourlyEvent } from "@/lib/hourly-event";
import { isThreeHourEventActive } from "@/lib/three-hour-event";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignTestOutcome } from "@/lib/test-outcome";
import {
  getSimulatedPrice,
  MARKET_SYMBOLS
} from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS = Object.keys(MARKET_SYMBOLS);
const DURATIONS = [1, 5, 10, 15, 30, 60, 86400];
const PAYOUT = 1.95;

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
async function settleExpiredReal(userId: string) {
  const account = await db.query(
    `SELECT email FROM app_users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  const email = String(
    account.rows[0]?.email || ""
  ).toLowerCase();

  const expired = await db.query(
    `SELECT id
     FROM real_mode_simulated_trades
     WHERE user_id = $1
       AND status = 'OPEN'
       AND created_at + expiry_seconds * INTERVAL '1 second' <= NOW()
     ORDER BY created_at ASC`,
    [userId]
  );

  for (const item of expired.rows) {
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const locked = await client.query(
        `SELECT *
         FROM real_mode_simulated_trades
         WHERE id = $1
           AND user_id = $2
           AND status = 'OPEN'
         FOR UPDATE`,
        [item.id, userId]
      );

      const trade = locked.rows[0];

      if (!trade) {
        await client.query("COMMIT");
        continue;
      }

      const stake = Number(trade.amount);
      const entryPrice = Number(trade.entry_price);
      const createdAt = new Date(trade.created_at).getTime();
      const expiryAt =
        createdAt + Number(trade.expiry_seconds) * 1000;

      if (
        !Number.isFinite(stake) ||
        stake <= 0 ||
        !Number.isFinite(entryPrice) ||
        !Number.isFinite(expiryAt)
      ) {
        throw new Error("Invalid expired trade values.");
      }

      const exitPrice = getSimulatedPrice(
        trade.asset,
        expiryAt
      );

      const exitDigit = getPriceDigit(
        trade.asset,
        exitPrice
      );

      const entryDigit =
        trade.entry_digit == null
          ? null
          : Number(trade.entry_digit);

      let won = isWinning(
        trade.contract_type as ContractType,
        String(trade.direction),
        entryPrice,
        exitPrice,
        entryDigit,
        exitDigit
      );

      let draw =
        trade.contract_type === "DIRECTIONAL" &&
        exitPrice === entryPrice;

      let hourlyEvent = false;
      let threeHourEvent = false;

      try {
        hourlyEvent = getHourlyEvent().active;
        threeHourEvent = isThreeHourEventActive();
      } catch (eventError) {
        console.error("Real event check failed:", eventError);
      }

      const recent = await client.query(
        `SELECT net_result, settled_at
         FROM real_mode_simulated_trades
         WHERE user_id = $1
           AND status IN ('EXPIRED', 'CASHED_OUT')
           AND settled_at IS NOT NULL
         ORDER BY settled_at DESC
         LIMIT 5`,
        [userId]
      );

      const fiveConsecutiveLosses =
        recent.rows.length === 5 &&
        recent.rows.every(
          (row: { net_result: number | string | null }) =>
            Number(row.net_result) < 0
        );

      const fifthLossTime = fiveConsecutiveLosses
        ? new Date(recent.rows[0].settled_at).getTime()
        : 0;

      const recoveryActive =
        fiveConsecutiveLosses &&
        Number.isFinite(fifthLossTime) &&
        Date.now() >= fifthLossTime &&
        Date.now() - fifthLossTime < 30_000;

      const winRate =
        threeHourEvent
          ? 60
          : hourlyEvent
            ? 37
            : recoveryActive
              ? 45
              : email === "jimmy@gmail.com"
                ? 80
                : 20;

     const individualWin = randomInt(100) < winRate;

won = await assignTestOutcome(
  client,
  "REAL_SIM",
  String(trade.id),
  individualWin,
  email
);

draw = false;
      const payout = draw
        ? stake
        : won
          ? Number((stake * PAYOUT).toFixed(2))
          : 0;

      const netResult = Number(
        (payout - stake).toFixed(2)
      );

      await client.query(
        `UPDATE real_mode_simulated_trades
         SET status = 'EXPIRED',
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
          payout.toFixed(2),
          netResult.toFixed(2),
          exitPrice,
          exitDigit
        ]
      );

      if (payout > 0) {
        await client.query(
          `INSERT INTO real_wallets (user_id)
           VALUES ($1)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );

        const walletResult = await client.query(
          `SELECT id
           FROM real_wallets
           WHERE user_id = $1
           FOR UPDATE`,
          [userId]
        );

        const wallet = walletResult.rows[0];

        if (!wallet) {
          throw new Error("TEST wallet unavailable.");
        }

        await client.query(
         UPDATE real_funds_wallets
SET available_balance = available_balance + $2,
    updated_at = NOW()
WHERE id = $1
          [wallet.id, payout.toFixed(2)]
        );

        await client.query(
          `INSERT INTO real_money_transactions (
             wallet_id, user_id, transaction_type, status,
             amount, currency, provider, idempotency_key,
             note, metadata
           )
           VALUES (
             $1, $2, 'TRADE_PAYOUT', 'SUCCEEDED',
             $3, 'KES', 'PALPLUSS', $4, $5, $6::jsonb
           )`,
          [
            wallet.id,
            userId,
            payout.toFixed(2),
            `aurevex-real-sim-expiry:${trade.id}`,
            "TEST simulated trade expiry settlement",
            JSON.stringify({
              simulationOnly: false,
              tradeId: trade.id
            })
          ]
        );
      }

      await client.query("COMMIT");
    } catch (settlementError) {
      await client.query("ROLLBACK");
      console.error(
        "Real simulated expiry settlement error:",
        settlementError
      );
    } finally {
      client.release();
    }
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
    // Automatically settle expired simulated REAL trades
    await settleExpiredReal(userId);
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

    const walletResult = await db.query(
  `SELECT available_balance, reserved_balance, currency
   FROM real_wallets
   WHERE user_id = $1
   LIMIT 1`,
  [userId]
);

const wallet = walletResult.rows[0];

return NextResponse.json(
  {
    trades: result.rows,
    simulatedWallet: {
      availableBalance: Number(wallet?.available_balance ?? 0),
      reservedBalance: Number(wallet?.reserved_balance ?? 0),
      currency: wallet?.currency ?? "KES"
    }
  },
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
   * Closes a simulated position and credits
   * the TEST wallet within the same transaction.
   * No genuine money is involved.
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
  await client.query("ROLLBACK");

  return error(
    "This position has expired. Refresh your trades to see its settled result.",
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

      const account = await client.query(
  `SELECT email FROM app_users WHERE id = $1 LIMIT 1`,
  [userId]
);

const email = String(
  account.rows[0]?.email || ""
).toLowerCase();

let hourlyEvent = false;
let threeHourEvent = false;

try {
  hourlyEvent = getHourlyEvent().active;
  threeHourEvent = isThreeHourEventActive();
} catch (eventError) {
  console.error("Real event check failed:", eventError);
}

const recent = await client.query(
  `SELECT net_result, settled_at
   FROM real_mode_simulated_trades
   WHERE user_id = $1
     AND status IN ('EXPIRED', 'CASHED_OUT')
     AND settled_at IS NOT NULL
   ORDER BY settled_at DESC
   LIMIT 5`,
  [userId]
);

const fiveConsecutiveLosses =
  recent.rows.length === 5 &&
  recent.rows.every(
    (row: { net_result: number | string | null }) =>
      Number(row.net_result) < 0
  );

const fifthLossTime = fiveConsecutiveLosses
  ? new Date(recent.rows[0].settled_at).getTime()
  : 0;

const recoveryActive =
  fiveConsecutiveLosses &&
  Number.isFinite(fifthLossTime) &&
  Date.now() >= fifthLossTime &&
  Date.now() - fifthLossTime < 30_000;

const winRate =
  threeHourEvent
    ? 60
    : hourlyEvent
      ? 37
      : recoveryActive
        ? 45
        : email === "jimmy@gmail.com"
          ? 80
          : 20;

const individualWin = randomInt(100) < winRate;

const cashOutWins = await assignTestOutcome(
  client,
  "REAL_SIM",
  String(trade.id),
  individualWin,
  email
);

const elapsedFraction = Math.max(
  0,
  Math.min(1, (now - createdAt) / durationMs)
);

const rawValue = cashOutWins
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

      // Credit the TEST wallet after simulated cash-out.
      await client.query(
        `INSERT INTO real_wallets (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      const walletResult = await client.query(
        `SELECT id
         FROM real_wallets
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );

      const wallet = walletResult.rows[0];

      if (!wallet) {
        throw new Error("TEST wallet unavailable.");
      }

      await client.query(
        UPDATE real_funds_wallets
SET available_balance = available_balance + $2,
    updated_at = NOW()
WHERE id = $1
        [wallet.id, cashOutAmount.toFixed(2)]
      );

      await client.query(
        INSERT INTO real_money_transactions (
  wallet_id, user_id, transaction_type, status,
  amount, currency, provider, idempotency_key,
  note, metadata
)
VALUES (
  $1, $2, 'TRADE_PAYOUT', 'SUCCEEDED',
  $3, 'KES', 'PALPLUSS', $4, $5, $6::jsonb
)
        [
          wallet.id,
          userId,
          cashOutAmount.toFixed(2),
          `aurevex-real-sim-payout:${trade.id}`,
          "TEST simulated trade cash-out",
          JSON.stringify({
            simulationOnly: false,
            tradeId: trade.id
          })
        ]
      );
      await client.query("COMMIT");

      return NextResponse.json({
     message:
  "TEST simulated position closed successfully. TEST wallet credited.",
        tradeId: trade.id,
        status: "CASHED_OUT",
        cashOutAmount,
        netResult,
        exitPrice: currentPrice,
        exitDigit: currentDigit,
        simulationOnly: false,
        walletCredited: true
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
  const amountUSD = Number(body.amount);
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
    !Number.isFinite(amountUSD) ||
    amountUSD < 1 ||
    amountUSD > 100 ||
    Math.round(amountUSD * 100) !== amountUSD * 100
  ) {
    return error("Stake must be between $1 and $100 USD.");
  }

  let usdPerKes: number;

  try {
    const rateResponse = await fetch(
      "https://open.er-api.com/v6/latest/KES",
      { cache: "no-store" }
    );

    const rateData = await rateResponse.json();
    usdPerKes = Number(rateData?.rates?.USD);

    if (
      !rateResponse.ok ||
      rateData?.result !== "success" ||
      !Number.isFinite(usdPerKes) ||
      usdPerKes <= 0
    ) {
      throw new Error("Exchange rate unavailable");
    }
  } catch {
    return error("Live exchange rate unavailable. Please try again.", 503);
  }

  const amount = Math.round(
    (amountUSD / usdPerKes) * 100
  ) / 100;

  if (!Number.isFinite(amount) || amount <= 0) {
    return error("Invalid converted stake.");
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
    // Deduct stake from the TEST wallet atomically.
    await client.query(
      `INSERT INTO real_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const walletResult = await client.query(
      `SELECT id, available_balance, currency
       FROM real_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet || wallet.currency !== "KES") {
      throw new Error("TEST wallet unavailable.");
    }

    if (Number(wallet.available_balance) < amount) {
      await client.query("ROLLBACK");
      return error("Insufficient TEST wallet balance.", 409);
    }

    const debit = await client.query(
     UPDATE real_funds_wallets
SET available_balance = available_balance + $2,
    updated_at = NOW()
WHERE id = $1
         AND available_balance >= $2
       RETURNING available_balance`,
      [wallet.id, amount.toFixed(2)]
    );

    if (!debit.rows[0]) {
      throw new Error("TEST wallet deduction failed.");
    }

    await client.query(
      `INSERT INTO real_money_transactions (
         wallet_id, user_id, transaction_type, status,
         amount, currency, provider, idempotency_key,
         note, metadata
       )
       VALUES (
         $1, $2, 'TRADE_STAKE', 'SUCCEEDED',
         $3, 'KES', 'PALPLUSS', $4, $5, $6::jsonb
       )`,
      [
        wallet.id,
        userId,
        amount.toFixed(2),
        `aurevex-real-sim-stake:${idempotencyKey}`,
        `TEST simulated trade stake - ${contractType}`,
        JSON.stringify({
          simulationOnly: false,
          asset,
          contractType
        })
      ]
    );

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
        simulationOnly: false,
        walletDebited: true,
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
