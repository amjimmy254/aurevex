import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCyzoraSignature } from "@/lib/cyzora";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null
    ? value as JsonObject
    : {};
}

function getText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Cyzora-Signature");

  if (!verifyCyzoraSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401 }
    );
  }

  let event: JsonObject;

  try {
    event = asObject(JSON.parse(rawBody));
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 }
    );
  }

  const eventType = getText(event.type, event.event);

  if (eventType === "webhook.test") {
    return NextResponse.json({ received: true });
  }

  if (
    eventType !== "charge.succeeded" &&
    eventType !== "charge.failed" &&
    eventType !== "charge.expired"
  ) {
    // Other event types are not handled by this deposit endpoint.
    return NextResponse.json({ received: true });
  }

  const data = asObject(event.data);
  const charge = asObject(data.object ?? data.charge ?? data);

  const accountRef = getText(
    charge.account_ref,
    asObject(charge.metadata).deposit_reference
  );

  const providerReference = getText(
    charge.reference,
    charge.id
  );

  const amount = Number(charge.amount);
  const currency = getText(charge.currency) ?? "KES";
  const livemode = event.livemode ?? charge.livemode;

  if (
    !accountRef ||
    !Number.isSafeInteger(amount) ||
    amount < 100 ||
    currency !== "KES" ||
    livemode !== false
  ) {
    return NextResponse.json(
      { error: "Invalid or unsupported charge details." },
      { status: 400 }
    );
  }

  const nextStatus =
    eventType === "charge.succeeded"
      ? "SUCCEEDED"
      : eventType === "charge.failed"
        ? "FAILED"
        : "EXPIRED";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT
         d.id,
         d.transaction_id,
         d.amount_cents,
         d.status AS deposit_status,
         t.wallet_id,
         t.status AS transaction_status
       FROM cyzora_deposits d
       JOIN real_money_transactions t
         ON t.id = d.transaction_id
       WHERE d.reference = $1
       FOR UPDATE OF d, t`,
      [accountRef]
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
        { error: "Payment amount does not match the deposit." },
        { status: 400 }
      );
    }

    // Repeated webhooks must never credit the wallet twice.
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
           updated_at = NOW()
       WHERE id = $2`,
      [nextStatus, deposit.id]
    );

    await client.query(
      `UPDATE real_money_transactions
       SET status = $1,
           provider_reference = COALESCE($2, provider_reference),
           updated_at = NOW()
       WHERE id = $3`,
      [
        nextStatus === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
        providerReference,
        deposit.transaction_id
      ]
    );

    if (nextStatus === "SUCCEEDED") {
      await client.query(
        `UPDATE real_wallets
         SET available_balance = available_balance + ($1::numeric / 100),
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
    console.error("Cyzora webhook processing error:", error);

    return NextResponse.json(
      { error: "Webhook processing failed. Please retry." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
