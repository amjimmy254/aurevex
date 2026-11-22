import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
  isValidCyzoraAmount,
  normalizeKenyanPhone,
} from "@/lib/cyzora";
import { palplussRequest } from "@/lib/palpluss";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  if (!isValidCyzoraAmount(amount, 65000)) {
    return NextResponse.json(
      { error: "Minimum deposit is KES 650 ($5)." },
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

  const idempotencyKey = `dep_${userId}_${clientKey}`;
  let transactionId = "";
  let depositReference = "";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT
         t.id AS transaction_id,
         t.user_id,
         t.metadata,
         d.reference,
         d.status AS deposit_status,
         d.amount_cents
       FROM real_money_transactions t
       JOIN cyzora_deposits d ON d.transaction_id = t.id
       WHERE t.idempotency_key = $1
       FOR UPDATE OF t, d`,
      [idempotencyKey]
    );

    if (existing.rows[0]) {
      const previous = existing.rows[0];
      const previousMetadata =
        typeof previous.metadata === "string"
          ? JSON.parse(previous.metadata)
          : previous.metadata;

      if (
        previous.user_id !== userId ||
        Number(previous.amount_cents) !== amount ||
        previousMetadata?.phone !== phone
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "This idempotency key was already used for a different deposit." },
          { status: 409 }
        );
      }

      if (previous.deposit_status !== "AWAITING_PAYMENT") {
        await client.query("COMMIT");
        return NextResponse.json({
          success: true,
          reused: true,
          reference: previous.reference,
          status: previous.deposit_status,
          message: "This deposit has already been processed."
        });
      }

      transactionId = previous.transaction_id;
      depositReference = previous.reference;
    } else {
      const walletResult = await client.query(
        `INSERT INTO real_wallets (user_id)
         VALUES ($1)
         ON CONFLICT (user_id)
         DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [userId]
      );

      const walletId = walletResult.rows[0].id;
      transactionId = randomUUID();
      depositReference = `AUR-${randomUUID()}`;

      await client.query(
        `INSERT INTO real_money_transactions (
           id, wallet_id, user_id, transaction_type, status,
           amount, currency, provider, idempotency_key, note, metadata
         )
         VALUES (
           $1, $2, $3, 'DEPOSIT', 'PENDING',
           $4, 'KES', 'CYZORA', $5,
           'Cyzora test-mode M-Pesa deposit', $6::jsonb
         )`,
        [
          transactionId,
          walletId,
          userId,
          amount / 100,
          idempotencyKey,
          JSON.stringify({ phone, mode: "test" })
        ]
      );

      await client.query(
        `INSERT INTO cyzora_deposits (
           user_id, transaction_id, reference, amount_cents,
           currency, status, livemode
         )
         VALUES ($1, $2, $3, $4, 'KES', 'AWAITING_PAYMENT', false)`,
        [userId, transactionId, depositReference, amount]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Deposit database error:", error);

    return NextResponse.json(
      { error: "Could not create the deposit request." },
      { status: 500 }
    );
  } finally {
    client.release();
  }

  try {
    const result = await cyzoraRequest<{
      id?: string;
      reference?: string;
      status?: string;
    }>("/charges", {
      method: "POST",
      idempotencyKey,
      body: {
        amount,
        phone,
        account_ref: depositReference,
        metadata: {
          deposit_reference: depositReference,
          transaction_id: transactionId,
          mode: "test"
        }
      }
    });

    const providerReference = result.reference ?? result.id ?? null;

    if (providerReference) {
      await db.query(
        `UPDATE real_money_transactions
         SET provider_reference = $1, updated_at = NOW()
         WHERE id = $2`,
        [String(providerReference), transactionId]
      );
    }

    return NextResponse.json({
      success: true,
      reference: depositReference,
      providerReference,
      status: "AWAITING_PAYMENT",
      amount: amount / 100,
      currency: "KES",
      message: "Deposit request submitted. Complete the M-Pesa prompt if it appears."
    });
  } catch (error) {
    console.error("Cyzora deposit request error:", error);

    return NextResponse.json(
      {
        success: false,
        reference: depositReference,
        status: "AWAITING_PAYMENT",
        message: "The request may still be processing. Retry with the same idempotency key; do not create a new deposit."
      },
      { status: 202 }
    );
  }
}
