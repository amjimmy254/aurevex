import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCyzoraSignature } from "@/lib/cyzora";

export const runtime = "nodejs";

type WebhookEvent = {
  event?: string;
  charge_id?: string;
  payout_id?: string;
  reference?: string;
  account_ref?: string;
  amount?: number;
  currency?: string;
  status?: string;
  mpesa_receipt?: string;
  livemode?: boolean;
  fee?: number;
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

  if (event.livemode !== false) {
    return NextResponse.json(
      { error: "Only test-mode events are accepted." },
      { status: 400 }
    );
  }

  if (
    event.event === "charge.succeeded" ||
    event.event === "charge.failed" ||
    event.event === "charge.expired"
  ) {
    return handleChargeEvent(event);
  }

  if (
    event.event === "payout.paid" ||
    event.event === "payout.failed"
  ) {
    return handlePayoutEvent(event);
  }

  return NextResponse.json({ received: true });
}

async function handleChargeEvent(event: WebhookEvent) {
  const reference = event.account_ref;
  const providerReference = event.reference;
  const amount = event.amount;

  if (
    !reference ||
    !Number.isSafeInteger(amount) ||
    (amount as number) < 100 ||
    (amount as number) % 100 !== 0 ||
    event.currency !== "KES"
  ) {
    return NextResponse.json(
      { error: "Invalid payment details." },
      { status: 400 }
    );
  }

  const nextStatus =
    event.event === "charge.succeeded"
      ? "SUCCEEDED"
      : event.event === "charge.expired"
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
      [nextStatus, event.mpesa_receipt ?? null, deposit.id]
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
    console.error("Cyzora charge webhook error:", error);

    return NextResponse.json(
      { error: "Charge webhook processing failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

async function handlePayoutEvent(event: WebhookEvent) {
  const payoutId = event.payout_id;
  const amount = event.amount;

  if (
    !payoutId ||
    !Number.isSafeInteger(amount) ||
    (amount as number) < 3000 ||
    (amount as number) % 100 !== 0
  ) {
    return NextResponse.json(
      { error: "Invalid payout details." },
      { status: 400 }
    );
  }

  const nextStatus =
    event.event === "payout.paid" ? "PAID" : "FAILED";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT
         w.id,
         w.transaction_id,
         w.amount_cents,
         w.status AS withdrawal_status,
         t.wallet_id
       FROM cyzora_withdrawals w
       JOIN real_money_transactions t
         ON t.id = w.transaction_id
       WHERE w.payout_id = $1
       FOR UPDATE OF w, t`,
      [payoutId]
    );

    const withdrawal = result.rows[0];

    if (!withdrawal) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Payout reference not found." },
        { status: 404 }
      );
    }

    if (Number(withdrawal.amount_cents) !== amount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Payout amount does not match." },
        { status: 400 }
      );
    }

    if (
      withdrawal.withdrawal_status === "PAID" ||
      withdrawal.withdrawal_status === "FAILED"
    ) {
      await client.query("COMMIT");
      return NextResponse.json({
        received: true,
        alreadyProcessed: true
      });
    }

    const walletUpdate = await client.query(
      `UPDATE real_wallets
       SET reserved_balance =
             reserved_balance - ($1::numeric / 100),
           available_balance =
             available_balance +
             CASE WHEN $2 = 'FAILED'
               THEN $1::numeric / 100
               ELSE 0
             END,
           updated_at = NOW()
       WHERE id = $3
         AND reserved_balance >= ($1::numeric / 100)
       RETURNING id`,
      [amount, nextStatus, withdrawal.wallet_id]
    );

    if (!walletUpdate.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Reserved wallet balance could not be reconciled." },
        { status: 500 }
      );
    }

    await client.query(
      `UPDATE cyzora_withdrawals
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [nextStatus, withdrawal.id]
    );

    await client.query(
      `UPDATE real_money_transactions
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [
        nextStatus === "PAID" ? "SUCCEEDED" : "FAILED",
        withdrawal.transaction_id
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      received: true,
      status: nextStatus
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Cyzora payout webhook error:", error);

    return NextResponse.json(
      { error: "Payout webhook processing failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
