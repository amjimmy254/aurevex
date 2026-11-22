import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPalplussTransaction } from "@/lib/palpluss";

export const runtime = "nodejs";

type PalplussWebhook = {
  event?: string;
  event_type?: string;
  transaction?: {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    external_reference?: string | null;
  };
};

 export async function POST(request: NextRequest) {
  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook JSON." },
      { status: 400 }
    );
  }

  if (
    rawPayload === null ||
    typeof rawPayload !== "object" ||
    Array.isArray(rawPayload)
  ) {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 }
    );
  }

  const payload = rawPayload as PalplussWebhook;
  const event = payload.event_type;
 
  const transaction = payload.transaction;

 if (
    payload.event !== "transaction.updated" ||
    typeof event !== "string" ||
    typeof transaction?.id !== "string" ||
    !transaction.id.trim() ||
    typeof transaction.external_reference !== "string" ||
    !transaction.external_reference.trim()
  ) {
    return NextResponse.json(
      { error: "Invalid Palpluss webhook structure." },
      { status: 400 }
    );
  }
   

  if (
    ![
      "transaction.success",
      "transaction.failed",
      "transaction.cancelled",
      "transaction.expired"
    ].includes(event ?? "")
  ) {
    return NextResponse.json({ received: true, ignored: true });
  }

  let verified;

  try {
    verified = await getPalplussTransaction(transaction.id);
  } catch (error) {
    console.error("Palpluss verification failed:", error);

    return NextResponse.json(
      { error: "Could not verify transaction with Palpluss." },
      { status: 503 }
    );
  }

  if (
    verified.transaction_id !== transaction.id ||
    verified.external_reference !== transaction.external_reference ||
    verified.currency !== "KES" ||
    verified.type !== "STK"
  ) {
    return NextResponse.json(
      { error: "Palpluss transaction details do not match." },
      { status: 400 }
    );
  }

 const amountCents = Number(verified.amount) * 100;
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 100
  ) {
    return NextResponse.json(
      { error: "Invalid verified transaction amount." },
      { status: 400 }
    );
  }

  const status = verified.status;

  if (!["SUCCESS", "FAILED", "CANCELLED", "EXPIRED"].includes(status ?? "")) {
    return NextResponse.json({
      received: true,
      verified: true,
      processing: true
    }, { status: 202 });
  }

  const nextStatus =
    status === "SUCCESS"
      ? "SUCCEEDED"
      : status === "FAILED"
        ? "FAILED"
        : status === "CANCELLED"
          ? "FAILED"
          : "EXPIRED";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

   const result = await client.query(
      `SELECT id, transaction_id, user_id, amount_cents, status, phone_number
       FROM palpluss_deposits
       WHERE palpluss_transaction_id = $1
         AND reference = $2
       FOR UPDATE`,
      [transaction.id, verified.external_reference]
    );

    const deposit = result.rows[0];

    if (!deposit) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Matching pending Palpluss deposit not found." },
        { status: 404 }
      );
    }

    if (
  Number(deposit.amount_cents) !== amountCents ||
  verified.phone_number !== deposit.phone_number
) {
      await client.query("ROLLBACK");

      return NextResponse.json(
       { error: "Deposit amount or phone number does not match." },
        { status: 400 }
      );
    }

    if (deposit.status !== "AWAITING_PAYMENT") {
      await client.query("COMMIT");

      return NextResponse.json({
        received: true,
        alreadyProcessed: true
      });
    }

    await client.query(
      `UPDATE palpluss_deposits
       SET status = $1,
           mpesa_receipt = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        nextStatus,
        verified.mpesa_receipt ?? null,
        deposit.id
      ]
    );

    const transactionStatus =
      nextStatus === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";

    const transactionUpdate = await client.query(
      `UPDATE real_money_transactions
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
         AND user_id = $3
         AND transaction_type = 'DEPOSIT'
         AND provider = 'PALPLUSS'
         AND status = 'PENDING'`,
      [transactionStatus, deposit.transaction_id, deposit.user_id]
    );

    if (transactionUpdate.rowCount !== 1) {
      throw new Error("Linked transaction was not in PENDING status.");
    }
    await client.query("COMMIT");

    if (nextStatus === "SUCCEEDED") {
      const walletUpdate = await client.query(
        `UPDATE real_wallets w
         SET available_balance = w.available_balance + ($1::numeric / 100),
             updated_at = NOW()
         FROM real_money_transactions t
         WHERE t.id = $2
           AND t.wallet_id = w.id
           AND t.user_id = $3
           AND t.transaction_type = 'DEPOSIT'
           AND t.status = 'SUCCEEDED'`,
        [amountCents, deposit.transaction_id, deposit.user_id]
      );

      if (walletUpdate.rowCount !== 1) {
        throw new Error("Wallet credit failed.");
      }
    }
    return NextResponse.json({
      received: true,
      verified: true,
      status: nextStatus,
      walletCredited: false
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Palpluss webhook processing error:", error);

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
