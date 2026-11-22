import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { normalizeKenyanPhone } from "@/lib/cyzora";
import { createPalplussStkPush } from "@/lib/palpluss";

export const runtime = "nodejs";

// Keep live collections disabled until production and compliance checks pass.
const PALPLUSS_DEPOSITS_ENABLED = false;

export async function POST(request: NextRequest) {
  if (!PALPLUSS_DEPOSITS_ENABLED) {
    return NextResponse.json(
      { error: "Palpluss deposits are not enabled yet." },
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
  const phone = normalizeKenyanPhone(body.phone);
  const clientKey = body.idempotencyKey;

  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 100
  ) {
    return NextResponse.json(
      { error: "Enter a valid deposit amount in KES cents." },
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

  const idempotencyKey = `pal_${userId}_${clientKey}`;
  const reference = `AUR-${randomUUID()}`;
  const transactionId = randomUUID();
  const amountKES = amount / 100;
  const client = await db.connect();

  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const existing = await client.query(
      `SELECT
         t.user_id,
         t.amount,
         t.metadata,
        d.reference,
d.palpluss_transaction_id,
d.status AS deposit_status
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
        Number(previous.amount) !== amountKES ||
        metadata?.phone !== phone
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "This request key was already used with different details." },
          { status: 409 }
        );
      }

      await client.query("COMMIT");
      transactionOpen = false;

      if (!previous.palpluss_transaction_id) {
  const stk = await createPalplussStkPush({
    phone,
    amount: amountKES,
    idempotencyKey,
    accountReference: previous.reference,
  });

  await client.query(
    `UPDATE palpluss_deposits
     SET palpluss_transaction_id = $1, updated_at = NOW()
     WHERE reference = $2 AND user_id = $3`,
    [stk.transactionId, previous.reference, userId]
  );
}
      return NextResponse.json({
        success: true,
        reference: previous.reference,
        status: previous.deposit_status,
        message: "This deposit request already exists."
      });
    }

    const walletResult = await client.query(
      `INSERT INTO real_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id)
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [userId]
    );

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
        walletResult.rows[0].id,
        userId,
        amountKES,
        idempotencyKey,
        JSON.stringify({ phone, mode: "disabled_pending_approval" })
      ]
    );

    await client.query(
      
      `INSERT INTO palpluss_deposits (
         user_id, transaction_id, reference, phone_number,
         amount_cents, currency, status
       )
       VALUES ($1, $2, $3, $4, $5, 'KES', 'AWAITING_PAYMENT')`,
      [userId, transactionId, reference, phone, amount]
    );

    await client.query("COMMIT");
    transactionOpen = false;
    
const stk = await createPalplussStkPush({
  phone,
  amount: amountKES,
  idempotencyKey,
  accountReference: reference,
});

await client.query(
  `UPDATE palpluss_deposits
   SET palpluss_transaction_id = $1,
       updated_at = NOW()
   WHERE reference = $2 AND user_id = $3`,
  [stk.transactionId, reference, userId]
);
    return NextResponse.json(
      {
        success: true,
        reference,
        status: "AWAITING_PAYMENT",
        message: "M-Pesa payment request sent. Complete the prompt on your phone."
      },
      { status: 201 }
    );
  } catch (error) {
    if (transactionOpen) {
  await client.query("ROLLBACK");
}
    console.error("Palpluss deposit record error:", error);

    return NextResponse.json(
      { error: "Could not create the deposit record." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
