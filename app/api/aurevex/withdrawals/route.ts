import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { evaluateWithdrawal } from "@/lib/withdrawal-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const digits = value.replace(/\D/g, "");
  let phone = digits;

  if (digits.startsWith("0")) {
    phone = `254${digits.slice(1)}`;
  } else if (digits.startsWith("7") || digits.startsWith("1")) {
    phone = `254${digits}`;
  }

  return /^254[17]\d{8}$/.test(phone) ? phone : null;
}

export async function POST(request: NextRequest) {
  // Request creation stays disabled until compliance review.
  // This endpoint never sends an M-Pesa payout.
  if (process.env.AUREVEX_WITHDRAWAL_REQUESTS_ENABLED !== "true") {
    return NextResponse.json(
      { error: "AUREVEX withdrawal requests are currently disabled." },
      { status: 503 }
    );
  }

  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to continue." },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const amountCents = body.amountCents;
  const phone = normalizePhone(body.phone);
  const clientKey = body.idempotencyKey;

  if (
    typeof amountCents !== "number" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1000 ||
    amountCents > 100000000
  ) {
    return NextResponse.json(
      { error: "Enter an amount between KES 10 and KES 1,000,000." },
      { status: 400 }
    );
  }

  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid Kenyan M-Pesa number." },
      { status: 400 }
    );
  }

  if (
    typeof clientKey !== "string" ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(clientKey)
  ) {
    return NextResponse.json(
      { error: "A valid idempotency key is required." },
      { status: 400 }
    );
  }

  const idempotencyKey = `aurevex_wd_${userId}_${clientKey}`;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Lock the wallet so concurrent requests cannot spend the same funds.
    const walletResult = await client.query(
      `SELECT id, available_balance, reversal_debt
       FROM real_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Your wallet is not available." },
        { status: 404 }
      );
    }

    // Repeated requests with the same key must not reserve funds twice.
    const existing = await client.query(
      `SELECT id, user_id, amount, fee, total_debit,
              currency, destination_phone, status, created_at
       FROM aurevex_withdrawal_requests
       WHERE idempotency_key = $1
       FOR UPDATE`,
      [idempotencyKey]
    );

    if (existing.rows[0]) {
      const previous = existing.rows[0];

      if (
        previous.user_id !== userId ||
        Number(previous.amount) * 100 !== amountCents ||
        previous.destination_phone !== phone
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "This request key was used with different details." },
          { status: 409 }
        );
      }

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        reused: true,
        withdrawal: {
          id: previous.id,
          amount: Number(previous.amount),
          fee: Number(previous.fee),
          totalDebit: Number(previous.total_debit),
          currency: previous.currency,
          phone: previous.destination_phone,
          status: previous.status,
          createdAt: previous.created_at
        }
      });
    }

    if (Number(wallet.reversal_debt) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Withdrawals are restricted because your wallet has outstanding reversal debt." },
        { status: 403 }
      );
    }

    const amount = amountCents / 100;

    if (Number(wallet.available_balance) < amount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Insufficient available balance." },
        { status: 409 }
      );
    }

    // No fee is charged until an approved fee schedule is configured.
    const fee = 0;
    const transactionId = randomUUID();

    await client.query(
      `INSERT INTO real_money_transactions (
         id, wallet_id, user_id, transaction_type, status,
         amount, currency, provider, idempotency_key, note, metadata
       )
       VALUES (
         $1, $2, $3, 'WITHDRAWAL', 'PENDING',
         $4::numeric / 100, 'KES', 'AUREVEX', $5,
         'AUREVEX withdrawal request awaiting review', $6::jsonb
       )`,
      [
        transactionId,
        wallet.id,
        userId,
        amountCents,
        idempotencyKey,
        JSON.stringify({
          mode: "request-only",
          payoutSent: false
        })
      ]
    );

    const requestResult = await client.query(
      `INSERT INTO aurevex_withdrawal_requests (
         user_id, wallet_id, transaction_id, idempotency_key,
         amount, fee, total_debit, currency, destination_phone, status
       )
       VALUES (
         $1, $2, $3, $4,
         $5::numeric / 100, $6, $7::numeric / 100,
         'KES', $8, 'PENDING_REVIEW'
       )
       RETURNING id, amount, fee, total_debit, currency,
                 destination_phone, status, created_at`,
      [
        userId,
        wallet.id,
        transactionId,
        idempotencyKey,
        amountCents,
        fee,
        amountCents,
        phone
      ]
    );

    // Reserve funds atomically and recheck restrictions in the UPDATE.
    const reserved = await client.query(
      `UPDATE real_wallets
       SET available_balance = available_balance - ($1::numeric / 100),
           reserved_balance = reserved_balance + ($1::numeric / 100),
           updated_at = NOW()
       WHERE id = $2
         AND reversal_debt = 0
         AND available_balance >= ($1::numeric / 100)
       RETURNING id`,
      [amountCents, wallet.id]
    );

    if (!reserved.rows[0]) {
      throw new Error("Wallet balance or restriction changed during reservation.");
    }

    await client.query(
      `INSERT INTO real_wallet_ledger (
         wallet_id, user_id, transaction_id, entry_type,
         amount, currency, metadata
       )
       VALUES (
         $1, $2, $3, 'WITHDRAWAL_RESERVE',
         $4::numeric / 100, 'KES', $5::jsonb
       )`,
      [
        wallet.id,
        userId,
        transactionId,
        amountCents,
        JSON.stringify({
          withdrawalRequestId: requestResult.rows[0].id
        })
      ]
    );

    await client.query("COMMIT");

    const withdrawal = requestResult.rows[0];

    return NextResponse.json(
      {
        success: true,
        withdrawal: {
          id: withdrawal.id,
          amount: Number(withdrawal.amount),
          fee: Number(withdrawal.fee),
          totalDebit: Number(withdrawal.total_debit),
          currency: withdrawal.currency,
          phone: withdrawal.destination_phone,
          status: withdrawal.status,
          createdAt: withdrawal.created_at
        },
        message: "Withdrawal request recorded for review. No payout has been sent."
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("AUREVEX withdrawal request error:", error);

    return NextResponse.json(
      { error: "Could not safely create the withdrawal request." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to view your withdrawals." },
      { status: 401 }
    );
  }

  try {
    const result = await db.query(
      `SELECT id, amount, fee, total_debit, currency,
              destination_phone, status, created_at, updated_at
       FROM aurevex_withdrawal_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    return NextResponse.json(
      {
        success: true,
        withdrawals: result.rows.map((row: any) => ({
          id: row.id,
          amount: Number(row.amount),
          fee: Number(row.fee),
          totalDebit: Number(row.total_debit),
          currency: row.currency,
          phone: row.destination_phone,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("AUREVEX withdrawal history error:", error);

    return NextResponse.json(
      { error: "Could not load withdrawal history." },
      { status: 500 }
    );
  }
}
