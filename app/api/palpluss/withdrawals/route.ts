import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { normalizeKenyanPhone } from "@/lib/cyzora";

export const runtime = "nodejs";

// Only allow withdrawal requests on non-production environments.
const WITHDRAWAL_REQUESTS_ENABLED =
  process.env.PALPLUSS_WITHDRAWAL_REQUESTS_ENABLED === "true" &&
  process.env.VERCEL_ENV !== "production";

export async function POST(request: NextRequest) {
  if (!WITHDRAWAL_REQUESTS_ENABLED) {
    return NextResponse.json(
      { error: "Withdrawal requests are disabled." },
      { status: 503 }
    );
  }

  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in." },
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

  const amount = body.amount;
  const phone = normalizeKenyanPhone(body.phone);
  const clientKey = body.idempotencyKey;

  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 1000 ||
    amount % 100 !== 0
  ) {
    return NextResponse.json(
      { error: "Enter a whole KES amount of at least KES 10, in cents." },
      { status: 400 }
    );
  }

  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid Kenyan M-Pesa phone number." },
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

  const idempotencyKey = `palwd_${userId}_${clientKey}`;
  const withdrawalId = randomUUID();
  const transactionId = randomUUID();
  const amountKES = amount / 100;

  const client = await db.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    // Ensure the user's real wallet exists.
    await client.query(
      `INSERT INTO real_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Serialize withdrawal requests for this wallet.
    const walletResult = await client.query(
      `SELECT id, available_balance, reserved_balance
       FROM real_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      throw new Error("REAL_WALLET_NOT_FOUND");
    }

    // Check whether this request was already submitted.
    const existing = await client.query(
      `SELECT
         w.id,
         w.destination_phone,
         w.amount_cents,
         w.status,
         t.user_id
       FROM palpluss_withdrawals w
       JOIN real_money_transactions t
         ON t.id = w.transaction_id
       WHERE w.idempotency_key = $1
       FOR UPDATE OF w, t`,
      [idempotencyKey]
    );

    if (existing.rows[0]) {
      const previous = existing.rows[0];

      if (
        previous.user_id !== userId ||
        previous.destination_phone !== phone ||
        Number(previous.amount_cents) !== amount
      ) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return NextResponse.json(
          { error: "This request key was already used with different details." },
          { status: 409 }
        );
      }

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json({
        success: true,
        withdrawalId: previous.id,
        status: previous.status,
        message: "Your existing withdrawal request was found."
      });
    }

    const availableBalance = Number(wallet.available_balance);

    if (
      !Number.isFinite(availableBalance) ||
      availableBalance < amountKES
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Insufficient real-wallet balance." },
        { status: 400 }
      );
    }

    // Reserve funds atomically. Do not touch the demo wallet.
    await client.query(
      `UPDATE real_wallets
       SET available_balance = available_balance - $1,
           reserved_balance = reserved_balance + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [amountKES, wallet.id]
    );

    await client.query(
      `INSERT INTO real_money_transactions (
         id,
         wallet_id,
         user_id,
         transaction_type,
         status,
         amount,
         currency,
         provider,
         idempotency_key,
         note,
         metadata
       )
       VALUES (
         $1, $2, $3, 'WITHDRAWAL', 'PENDING',
         $4, 'KES', 'PALPLUSS', $5,
         'Palpluss withdrawal request',
         $6::jsonb
       )`,
      [
        transactionId,
        wallet.id,
        userId,
        amountKES,
        idempotencyKey,
        JSON.stringify({
          phone,
          mode: "test_request_only",
          payoutSent: false
        })
      ]
    );

    await client.query(
      `INSERT INTO palpluss_withdrawals (
         id,
         user_id,
         transaction_id,
         idempotency_key,
         destination_phone,
         amount_cents,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [
        withdrawalId,
        userId,
        transactionId,
        idempotencyKey,
        phone,
        amount
      ]
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json(
      {
        success: true,
        withdrawalId,
        status: "PENDING",
        amount: amountKES,
        currency: "KES",
        message: "Withdrawal request recorded. No payout has been sent."
      },
      { status: 201 }
    );
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }

    console.error("Palpluss withdrawal request failed:", error);

    return NextResponse.json(
      { error: "Could not create the withdrawal request." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
