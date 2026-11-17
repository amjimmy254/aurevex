
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "BTC/USD",
  "ETH/USD",
  "GOLD/USD"
];

const DURATIONS = [10, 30, 60, 300];
const PAYOUT = 1.8;

async function getUser(request: NextRequest) {
  const secret = process.env.AUREVEX_SESSION_SECRET;
  const token = request.cookies.get("aurevex_session")?.value;

  if (!secret || secret.length < 32 || !token) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    return payload.sub || null;
  } catch {
    return null;
  }
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function settle(userId: string) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const trades = await client.query(
      `SELECT id, amount
       FROM demo_trades
       WHERE user_id = $1
       AND status = 'PENDING'
       AND created_at + expiry_seconds * INTERVAL '1 second' <= NOW()
       FOR UPDATE SKIP LOCKED`,
      [userId]
    );

    for (const trade of trades.rows) {
      const stake = Number(trade.amount);
      const won = randomInt(0, 2) === 1;

      if (won) {
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
          [userId, returned, "Demo trade payout"]
        );

        await client.query(
          `UPDATE demo_trades
           SET status = 'WON',
           simulated_result = $2,
           settled_at = NOW()
           WHERE id = $1`,
          [trade.id, profit]
        );
      } else {
        await client.query(
          `UPDATE demo_trades
           SET status = 'LOST',
           simulated_result = $2,
           settled_at = NOW()
           WHERE id = $1`,
          [trade.id, stake.toFixed(2)]
        );
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function GET(request: NextRequest) {
  const userId = await getUser(request);

  if (!userId) return error("Please log in again.", 401);

  try {
    await settle(String(userId));

    const result = await db.query(
      `SELECT id, asset, direction, amount,
       expiry_seconds, status, simulated_result,
       created_at, settled_at
       FROM demo_trades
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return NextResponse.json(
      { trades: result.rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return error("Could not load trades.", 500);
  }
}

export async function POST(request: NextRequest) {
  const userId = await getUser(request);

  if (!userId) return error("Please log in again.", 401);

  let body;

  try {
    body = await request.json();
  } catch {
    return error("Invalid request.");
  }

  const asset = body.asset;
  const direction = body.direction;
  const amount = Number(body.amount);
  const expiry = Number(body.expirySeconds);

  if (!ASSETS.includes(asset))
    return error("Invalid trading pair.");

  if (!["CALL", "PUT"].includes(direction))
    return error("Choose CALL or PUT.");

  if (
    !Number.isFinite(amount) ||
    amount < 1 ||
    amount > 500 ||
    Math.round(amount * 100) !== amount * 100
  ) return error("Stake must be $1-$500.");

  if (!DURATIONS.includes(expiry))
    return error("Invalid expiry duration.");

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

    if (Number(wallet.rows[0].virtual_balance) < amount) {
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
        expiry_seconds, status, simulated_result)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 0)
       RETURNING *`,
      [userId, asset, direction, amount.toFixed(2), expiry]
    );

    await client.query(
      `INSERT INTO demo_transactions
       (user_id, wallet_type, transaction_type, amount, note)
       VALUES ($1, 'MAIN', 'DEMO_DEBIT', $2, $3)`,
      [userId, amount.toFixed(2), "Demo trade stake"]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        message: "Demo trade placed successfully.",
        trade: result.rows[0]
      },
      { status: 201 }
    );
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return error("Could not place trade.", 500);
  } finally {
    client.release();
  }
}
