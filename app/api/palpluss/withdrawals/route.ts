import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { normalizeKenyanPhone } from "@/lib/cyzora";

export const runtime = "nodejs";

// Keep disabled. No actual payout is sent by this endpoint.
const WITHDRAWAL_REQUESTS_ENABLED = false;

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

  const amountKES = amount / 100;
  const idempotencyKey = `palwd_${userId}_${clientKey}`;
  const sourceReference = `PALPLUSS_WITHDRAWAL:${userId}:${clientKey}`;
  const client = await db.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    // Only the genuine-funds wallet is used.
    await client.query(
      `INSERT INTO real_funds_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const walletResult = await client.query(
     `SELECT id, available_balance, reserved_balance, currency,
        is_frozen, reversal_due
 FROM real_funds_wallets
 WHERE user_id = $1
 FOR UPDATE`,
      [userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet || wallet.currency !== "KES") {
      throw new Error("GENUINE_FUNDS_WALLET_NOT_FOUND");
    }

    // Check for a previous request before reserving funds again.
    const existing = await client.query(
      `SELECT id, user_id, transaction_type, status,
              amount, currency, metadata
       FROM real_funds_transactions
       WHERE idempotency_key = $1
       FOR UPDATE`,
      [idempotencyKey]
    );

    if (existing.rows[0]) {
      const previous = existing.rows[0];
      const metadata =
        previous.metadata && typeof previous.metadata === "object"
          ? previous.metadata as Record<string, unknown>
          : {};

      if (
        previous.user_id !== userId ||
        previous.transaction_type !== "WITHDRAWAL" ||
        previous.currency !== "KES" ||
        Number(previous.amount) !== amountKES ||
        metadata.phone !== phone
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
        amount: amountKES,
        currency: "KES",
        payoutSent: false,
        message: "Existing request found. No payout has been sent."
      });
    }

    // Reserve only verified genuine funds.
    const reserveResult = await client.query(
      `UPDATE real_funds_wallets
       SET available_balance = available_balance - $1,
           reserved_balance = reserved_balance + $1,
           updated_at = NOW()
       WHERE id = $2
         AND currency = 'KES'
         AND available_balance >= $1
       RETURNING id`,
      [amountKES, wallet.id]
    );

    if (reserveResult.rowCount !== 1) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Insufficient genuine-funds balance." },
        { status: 400 }
      );
    }

    const ledgerResult = await client.query(
      `INSERT INTO real_funds_transactions (
         user_id,
         transaction_type,
         status,
         amount,
         currency,
         source_reference,
         idempotency_key,
         metadata
       )
       VALUES ($1, 'WITHDRAWAL', 'PENDING', $2, 'KES', $3, $4, $5::jsonb)
       RETURNING id`,
      [
        userId,
        amountKES,
        sourceReference,
        idempotencyKey,
        JSON.stringify({
          provider: "PALPLUSS",
          phone,
          amountCents: amount,
          mode: "request_record_only",
          payoutSent: false
        })
      ]
    );

    if (ledgerResult.rowCount !== 1) {
      throw new Error("GENUINE_FUNDS_WITHDRAWAL_LEDGER_FAILED");
    }

    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json(
      {
        success: true,
        withdrawalId: ledgerResult.rows[0].id,
        status: "PENDING",
        amount: amountKES,
        currency: "KES",
        payoutSent: false,
        message: "Genuine funds reserved. No payout has been sent."
      },
      { status: 201 }
    );
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }

    console.error(
      "Palpluss genuine-funds withdrawal request failed:",
      error
    );

    return NextResponse.json(
      { error: "Could not create the withdrawal request." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
