
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) return error("Please sign in again.", 401);

  try {
    const result = await db.query(
      `SELECT id, transaction_type, amount, note, created_at
       FROM demo_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return NextResponse.json(
      { transactions: result.rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("Wallet activity error:", e);
    return error("Could not load wallet activity.", 500);
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) return error("Please sign in again.", 401);

  let body;

  try {
    body = await request.json();
  } catch {
    return error("Invalid request.");
  }

  const action = body.action;
  const amount = Number(body.amount);

  if (!["DEPOSIT", "WITHDRAWAL"].includes(action)) {
    return error("Invalid demo wallet action.");
  }

  if (
    !Number.isFinite(amount) ||
    amount < 5 ||
    amount > 5000 ||
    Math.round(amount * 100) !== amount * 100
  ) {
    return error("Amount must be between $5 and $5,000.");
  }

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
      return error("Demo wallet not found.", 404);
    }

    const balance = Number(wallet.rows[0].virtual_balance);
    const isDeposit = action === "DEPOSIT";

    if (!isDeposit && balance < amount) {
      await client.query("ROLLBACK");
      return error("Insufficient virtual demo balance.");
    }

    const transactionType = isDeposit
      ? "DEMO_CREDIT"
      : "DEMO_DEBIT";

    const note = isDeposit
      ? "Simulated demo deposit"
      : "Simulated demo withdrawal";

    await client.query(
      `UPDATE demo_wallets
       SET virtual_balance = virtual_balance ${isDeposit ? "+" : "-"} $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, amount.toFixed(2)]
    );

    const transaction = await client.query(
      `INSERT INTO demo_transactions
       (user_id, wallet_type, transaction_type, amount, note)
       VALUES ($1, 'MAIN', $2, $3, $4)
       RETURNING id, transaction_type, amount, note, created_at`,
      [userId, transactionType, amount.toFixed(2), note]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      message: isDeposit
        ? "Simulated demo deposit completed. No real money received."
        : "Simulated demo withdrawal completed. No real money sent.",
      transaction: transaction.rows[0]
    }, { status: 201 });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Wallet action error:", e);
    return error("Could not complete wallet action.", 500);
  } finally {
    client.release();
  }
}
