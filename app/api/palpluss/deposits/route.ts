import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { initiatePalplussStk } from "@/lib/palpluss";

export const runtime = "nodejs";

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
  // Safety lock: live requests remain disabled by default.
  if (process.env.PALPLUSS_DEPOSITS_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Palpluss deposits are not enabled." },
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

  const amount = body.amount;
  const phone = normalizePhone(body.phone);
  const clientKey = body.idempotencyKey;

  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 100 ||
    amount > 100000000
  ) {
    return NextResponse.json(
      { error: "Invalid deposit amount in cents." },
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

  const idempotencyKey = `pal_dep_${userId}_${clientKey}`;
  const client = await db.connect();

  let transactionId = "";
  let reference = "";

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT
         t.id AS transaction_id,
         t.user_id,
         t.metadata,
         t.provider_reference,
         d.reference,
         d.status AS deposit_status,
         d.amount_cents
       FROM real_money_transactions t
       JOIN palpluss_deposits d ON d.transaction_id = t.id
       WHERE t.idempotency_key = $1
       FOR UPDATE OF t, d`,
      [idempotencyKey]
    );

    if (existing.rows[0]) {
      const previous = existing.rows[0];
      const metadata =
        typeof previous.metadata === "string"
          ? JSON.parse(previous.metadata)
          : previous.metadata;

      if (
        previous.user_id !== userId ||
        Number(previous.amount_cents) !== amount ||
        metadata?.phone !== phone
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "This idempotency key belongs to a different deposit." },
          { status: 409 }
        );
      }

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        reused: true,
        reference: previous.reference,
        status: previous.deposit_status,
        message: "This deposit request already exists. Check its status before retrying."
      });
    }

    const wallet = await client.query(
      `INSERT INTO real_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id)
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [userId]
    );

    transactionId = randomUUID();
    reference = `AUR-${randomUUID()}`;

    await client.query(
      `INSERT INTO real_money_transactions (
         id, wallet_id, user_id, transaction_type, status,
         amount, currency, provider, idempotency_key, note, metadata
       )
       VALUES (
         $1, $2, $3, 'DEPOSIT', 'PENDING',
         $4, 'KES', 'PALPLUSS', $5,
         'Palpluss M-Pesa deposit', $6::jsonb
       )`,
      [
        transactionId,
        wallet.rows[0].id,
        userId,
        amount / 100,
        idempotencyKey,
        JSON.stringify({ phone, mode: "live-disabled-by-default" })
      ]
    );

    await client.query(
      `INSERT INTO palpluss_deposits (
         user_id, transaction_id, reference,
         amount_cents, currency, phone, status
       )
       VALUES ($1, $2, $3, $4, 'KES', $5, 'AWAITING_PAYMENT')`,
      [userId, transactionId, reference, amount, phone]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Palpluss deposit database error:", error);

    return NextResponse.json(
      { error: "Could not create the deposit request." },
      { status: 500 }
    );
  } finally {
    client.release();
  }

  try {
    const result = await initiatePalplussStk({
      amountCents: amount,
      phone,
      reference
    });

    await db.query(
      `UPDATE palpluss_deposits
       SET palpluss_transaction_id = $1,
           status = 'PROCESSING',
           updated_at = NOW()
       WHERE transaction_id = $2`,
      [result.transactionId, transactionId]
    );

    await db.query(
      `UPDATE real_money_transactions
       SET provider_reference = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [result.transactionId, transactionId]
    );

    return NextResponse.json({
      success: true,
      reference,
      status: "PROCESSING",
      amount: amount / 100,
      currency: "KES",
      message: "Payment request submitted. Complete the M-Pesa prompt if one appears."
    });
  } catch (error) {
    console.error("Palpluss request error:", error);

    // Do not mark failed: the provider may have received the request.
    return NextResponse.json(
      {
        success: false,
        reference,
        status: "AWAITING_PAYMENT",
        message: "The payment request could not be confirmed. Do not create another deposit; check its status first."
      },
      { status: 202 }
    );
  }
}
