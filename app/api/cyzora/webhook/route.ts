import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCyzoraSignature } from "@/lib/cyzora";

export const runtime = "nodejs";

type WebhookEvent = {
  event?: string;
  charge_id?: string;
  reference?: string;
  account_ref?: string;
  amount?: number;
  currency?: string;
  status?: string;
  mpesa_receipt?: string;
  livemode?: boolean;
  metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Cyzora-Signature");

  if (!verifyCyzoraSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401 }
    );
  }

  let event: WebhookEvent;

  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 }
    );
  }

  if (event.event === "webhook.test") {
    return NextResponse.json({ received: true });
  }

  const eventType = event.event;

  if (
    eventType !== "charge.succeeded" &&
    eventType !== "charge.failed" &&
    eventType !== "charge.expired"
  ) {
    return NextResponse.json({ received: true });
  }

  const reference = event.account_ref;
  const providerReference = event.reference;
  const amount = event.amount;

  if (
    !reference ||
    !Number.isSafeInteger(amount) ||
    (amount as number) < 100 ||
    event.currency !== "KES" ||
    event.livemode !== false
  ) {
    return NextResponse.json(
      { error: "Invalid or unsupported payment details." },
      { status: 400 }
    );
  }

  const nextStatus =
    eventType === "charge.succeeded"
      ? "SUCCEEDED"
      : eventType === "charge.expired"
        ? "EXPIRED"
        : "FAILED";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT
         d.id,
         d.transaction_id,
         d.amount_cents,
         d.status AS deposit_status,
         t.wallet_id
       FROM cyzora_deposits d
       JOIN real_money_transactions t
         ON t.id = d.transaction_id
       WHERE d.reference = $1
       FOR UPDATE OF d, t`,
      [reference]
    );

    const deposit = result.rows[0];

    if (!deposit) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Deposit reference not found." },
        { status: 404 }
      );
    }

    if (Number(deposit.amount_cents) !== amount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Payment amount does not match." },
        { status: 400 }
      );
    }

    if (deposit.deposit_status !== "AWAITING_PAYMENT") {
      await client.query("COMMIT");
      return NextResponse.json({
        received: true,
        alreadyProcessed: true
      });
    }

    await client.query(
      `UPDATE cyzora_deposits
       SET status = $1,
           mpesa_receipt = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        nextStatus,
        event.mpesa_receipt ?? null,
        deposit.id
      ]
    );

    await client.query(
      `UPDATE real_money_transactions
       SET status = $1,
           provider_reference = COALESCE($2, provider_reference),
           updated_at = NOW()
       WHERE id = $3`,
      [
        nextStatus === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
        providerReference ?? null,
        deposit.transaction_id
      ]
    );

    if (nextStatus === "SUCCEEDED") {
      await client.query(
        `UPDATE real_wallets
         SET available_balance =
               available_balance + ($1::numeric / 100),
             updated_at = NOW()
         WHERE id = $2`,
        [amount, deposit.wallet_id]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      received: true,
      status: nextStatus
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Cyzora webhook error:", error);

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
