import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPalplussSdkTransaction } from "@/lib/palpluss-sdk";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

type PalplussWebhook = {
  event?: string;
  event_type?: string;
  transaction?: {
    id?: string;
    type?: string;
    status?: string;
    amount?: number;
    currency?: string;
    phone_number?: string;
    external_reference?: string | null;
    result_code?: string | null;
    result_desc?: string | null;
    mpesa_receipt?: string | null;
  };
};

 export async function POST(request: NextRequest) {
  const secret = process.env.PALPLUSS_WEBHOOK_SECRET;

  if (!secret) {
    console.error("PALPLUSS_WEBHOOK_SECRET is missing.");
    return NextResponse.json(
      { error: "Webhook security is not configured." },
      { status: 500 }
    );
  }

 let payload: PalplussWebhook;
   let webhookId = "";

try {
  const rawBody = await request.text();

  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signatures = request.headers.get("webhook-signature");

  const timestampSeconds = Number(timestamp);

  if (
    !id ||
    !timestamp ||
    !signatures ||
    !Number.isFinite(timestampSeconds) ||
    Math.abs(Date.now() / 1000 - timestampSeconds) > 300
  ) {
    return NextResponse.json(
      { error: "Invalid or expired webhook headers." },
      { status: 400 }
    );
  }

  const key = Buffer.from(
    secret.replace(/^whsec_/, ""),
    "base64"
  );

  if (key.length === 0) {
    console.error("Invalid Palpluss webhook secret.");
    return NextResponse.json(
      { error: "Webhook security configuration is invalid." },
      { status: 500 }
    );
  }

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  const isValid = signatures.split(" ").some((part) => {
    const [version, signature] = part.split(",");

    return (
      version === "v1" &&
      !!signature &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  });

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }
  webhookId = id;

  payload = JSON.parse(rawBody) as PalplussWebhook;
} catch {
  console.warn("Palpluss webhook verification or parsing failed.");
  return NextResponse.json(
    { error: "Invalid webhook request." },
    { status: 400 }
  );
}
   if (
  payload.event === "webhook.test" &&
  payload.event_type === "webhook.test"
) {
  return NextResponse.json(
    { received: true, test: true },
    { status: 200 }
  );
}
 const event = payload.event_type;
  const transaction = payload.transaction;

if (
  payload.event !== "transaction.updated" ||
  typeof event !== "string" ||
  typeof transaction?.id !== "string" ||
  !transaction.id.trim() ||
  !["STK", "B2C"].includes(transaction.type ?? "")
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
    "transaction.expired",
    "transaction.updated"
  ].includes(event ?? "")
) {
  return NextResponse.json({ received: true, ignored: true });
}

  let verified;

  try {
    verified = await getPalplussSdkTransaction(transaction.id);
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
  verified.type !== transaction.type ||
  verified.status !== transaction.status ||
  !Number.isFinite(Number(transaction.amount)) ||
  Number(verified.amount) !== Number(transaction.amount) ||
  typeof transaction.phone_number !== "string" ||
  !transaction.phone_number.trim() ||
  verified.phone_number !== transaction.phone_number
) {
  return NextResponse.json(
    { error: "Palpluss transaction details do not match." },
    { status: 400 }
  );
}

if (verified.type === "B2C") {
  const providerStatus = verified.status;

  if (
  ![
    "PENDING",
    "PROCESSING",
    "SUCCESS",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "REVERSED"
  ].includes(providerStatus ?? "")
) {
  return NextResponse.json(
    { received: true, verified: true, processing: true },
    { status: 202 }
  );
}

  const isSuccess = providerStatus === "SUCCESS";
  const isFailure = ["FAILED", "CANCELLED", "EXPIRED"].includes(
    providerStatus ?? ""
  );

  const amountCents = Number(verified.amount) * 100;

  if (!Number.isSafeInteger(amountCents) || amountCents < 1000) {
    return NextResponse.json(
      { error: "Invalid B2C payout amount." },
      { status: 400 }
    );
  }

  if (
    typeof verified.external_reference !== "string" ||
    !verified.external_reference.trim()
  ) {
    return NextResponse.json(
      { error: "Missing B2C withdrawal reference." },
      { status: 400 }
    );
  }
  if (providerStatus === "REVERSED") {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      transaction.id
    );

  if (!isUuid || !webhookId || webhookId.length > 256) {
    return NextResponse.json(
      { error: "Invalid B2C reversal identifiers." },
      { status: 400 }
    );
  }

  const reversalClient = await db.connect();
  let reversalTransactionOpen = false;

  try {
    await reversalClient.query("BEGIN");
    reversalTransactionOpen = true;

    const ownerResult = await reversalClient.query(
      `SELECT w.user_id
       FROM palpluss_withdrawals w
       JOIN real_funds_transactions t
         ON t.id = w.transaction_id
        AND t.user_id = w.user_id
       WHERE t.source_reference = $1
         AND t.transaction_type = 'WITHDRAWAL'
         AND t.metadata->>'provider' = 'PALPLUSS'
       LIMIT 1`,
      [verified.external_reference]
    );

    const owner = ownerResult.rows[0];

    if (!owner) {
      await reversalClient.query("ROLLBACK");
      reversalTransactionOpen = false;

      return NextResponse.json(
        { error: "Matching B2C withdrawal not found." },
        { status: 404 }
      );
    }

    // Lock the wallet first.
   const walletResult = await reversalClient.query(
  `SELECT id
   FROM real_funds_wallets
   WHERE user_id = $1
   FOR UPDATE`,
  [owner.user_id]
);

    const wallet = walletResult.rows[0];

   if (!wallet) {
  throw new Error("B2C_REVERSAL_WALLET_NOT_FOUND");
}

    // Lock the payout and its genuine-funds ledger record.
    const withdrawalResult = await reversalClient.query(
      `SELECT
         w.id,
         w.user_id,
         w.transaction_id,
         w.payout_id,
         w.destination_phone,
         w.amount_cents,
         w.status,
         t.status AS ledger_status,
         t.amount AS ledger_amount,
         t.currency,
         t.transaction_type
       FROM palpluss_withdrawals w
       JOIN real_funds_transactions t
         ON t.id = w.transaction_id
        AND t.user_id = w.user_id
       WHERE t.source_reference = $1
         AND w.user_id = $2
       FOR UPDATE OF w, t`,
      [verified.external_reference, owner.user_id]
    );

    const withdrawal = withdrawalResult.rows[0];

    if (
      !withdrawal ||
      withdrawal.transaction_type !== "WITHDRAWAL" ||
      withdrawal.currency !== "KES" ||
      Number(withdrawal.amount_cents) !== amountCents ||
      Math.round(Number(withdrawal.ledger_amount) * 100) !== amountCents ||
      withdrawal.destination_phone !== verified.phone_number
    ) {
      await reversalClient.query("ROLLBACK");
      reversalTransactionOpen = false;

      return NextResponse.json(
        { error: "B2C reversal details do not match." },
        { status: 409 }
      );
    }

    if (
      withdrawal.payout_id &&
      withdrawal.payout_id !== transaction.id
    ) {
      await reversalClient.query("ROLLBACK");
      reversalTransactionOpen = false;

      return NextResponse.json(
        { error: "B2C reversal payout ID mismatch." },
        { status: 409 }
      );
    }

    // Check whether this reversal was already recorded.
    const existingResult = await reversalClient.query(
      `SELECT
         webhook_id,
         provider_transaction_id,
         withdrawal_id,
         transaction_id,
         user_id,
         amount_cents
       FROM palpluss_withdrawal_reversals
       WHERE webhook_id = $1
          OR provider_transaction_id = $2
          OR withdrawal_id = $3
       FOR UPDATE`,
      [webhookId, transaction.id, withdrawal.id]
    );

    if (existingResult.rowCount && existingResult.rowCount > 0) {
      const matches = existingResult.rows.every(
        (row) =>
          row.provider_transaction_id === transaction.id &&
          row.withdrawal_id === withdrawal.id &&
          row.transaction_id === withdrawal.transaction_id &&
          row.user_id === withdrawal.user_id &&
          Number(row.amount_cents) === amountCents
      );

      if (!matches) {
        await reversalClient.query("ROLLBACK");
        reversalTransactionOpen = false;

        return NextResponse.json(
          { error: "Conflicting B2C reversal record." },
          { status: 409 }
        );
      }

      await reversalClient.query("COMMIT");
      reversalTransactionOpen = false;

      return NextResponse.json({
        received: true,
        verified: true,
        alreadyProcessed: true,
        reversalRecorded: true,
        manualReview: true
      });
    }

    if (
      !["PENDING", "PROCESSING", "PAID"].includes(withdrawal.status) ||
      !["PENDING", "SUCCEEDED"].includes(withdrawal.ledger_status)
    ) {
      await reversalClient.query("ROLLBACK");
      reversalTransactionOpen = false;

      return NextResponse.json(
        { error: "Withdrawal cannot be reversed from its current state." },
        { status: 409 }
      );
    }

    const reversalInsert = await reversalClient.query(
      `INSERT INTO palpluss_withdrawal_reversals (
         webhook_id,
         provider_transaction_id,
         withdrawal_id,
         transaction_id,
         user_id,
         amount_cents,
         currency,
         previous_withdrawal_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'KES', $7)
       RETURNING id`,
      [
        webhookId,
        transaction.id,
        withdrawal.id,
        withdrawal.transaction_id,
        withdrawal.user_id,
        amountCents,
        withdrawal.status
      ]
    );

    if (reversalInsert.rowCount !== 1) {
      throw new Error("B2C_REVERSAL_RECORD_INSERT_FAILED");
    }

    // Freeze the wallet; do not guess whether funds have returned.
    const walletUpdate = await reversalClient.query(
      `UPDATE real_funds_wallets
       SET is_frozen = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [wallet.id]
    );

    if (walletUpdate.rowCount !== 1) {
      throw new Error("B2C_REVERSAL_WALLET_FREEZE_FAILED");
    }

    const payoutUpdate = await reversalClient.query(
      `UPDATE palpluss_withdrawals
       SET status = 'REVERSED',
           payout_id = COALESCE(payout_id, $1),
           failure_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id`,
      [
        transaction.id,
        "PalPluss reported a reversal; manual reconciliation required.",
        withdrawal.id
      ]
    );

    if (payoutUpdate.rowCount !== 1) {
      throw new Error("B2C_REVERSAL_PAYOUT_UPDATE_FAILED");
    }

    const ledgerUpdate = await reversalClient.query(
      `UPDATE real_funds_transactions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1
         AND user_id = $3
         AND transaction_type = 'WITHDRAWAL'
       RETURNING id`,
      [
        withdrawal.transaction_id,
        JSON.stringify({
          provider: "PALPLUSS",
          providerReversed: true,
          providerTransactionId: transaction.id,
          reversalWebhookId: webhookId,
          reversalRecordId: reversalInsert.rows[0].id,
          manualReconciliationRequired: true
        }),
        withdrawal.user_id
      ]
    );

    if (ledgerUpdate.rowCount !== 1) {
      throw new Error("B2C_REVERSAL_LEDGER_UPDATE_FAILED");
    }

    await reversalClient.query("COMMIT");
    reversalTransactionOpen = false;

    return NextResponse.json(
      {
        received: true,
        verified: true,
        reversalRecorded: true,
        manualReview: true,
        walletFrozen: true
      },
      { status: 202 }
    );
  } catch (error) {
    if (reversalTransactionOpen) {
      await reversalClient.query("ROLLBACK");
    }

    console.error("PalPluss B2C reversal processing failed:", error);

    return NextResponse.json(
      { error: "B2C reversal processing failed." },
      { status: 500 }
    );
  } finally {
    reversalClient.release();
  }
}

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const ownerResult = await client.query(
      `SELECT w.user_id
       FROM palpluss_withdrawals w
       JOIN real_funds_transactions t
         ON t.id = w.transaction_id
        AND t.user_id = w.user_id
       WHERE t.source_reference = $1
         AND t.transaction_type = 'WITHDRAWAL'
         AND t.metadata->>'provider' = 'PALPLUSS'
       LIMIT 1`,
      [verified.external_reference]
    );

    const owner = ownerResult.rows[0];

    if (!owner) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Matching AUREVEX withdrawal not found." },
        { status: 404 }
      );
    }

    const walletResult = await client.query(
      `SELECT id, reserved_balance, currency
       FROM real_funds_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [owner.user_id]
    );

    const wallet = walletResult.rows[0];

    if (!wallet || wallet.currency !== "KES") {
      throw new Error("B2C_GENUINE_FUNDS_WALLET_NOT_FOUND");
    }

    const withdrawalResult = await client.query(
      `SELECT
         w.id,
         w.user_id,
         w.transaction_id,
         w.payout_id,
         w.destination_phone,
         w.amount_cents,
         w.status,
         t.status AS ledger_status,
         t.amount AS ledger_amount,
         t.currency,
         t.transaction_type
       FROM palpluss_withdrawals w
       JOIN real_funds_transactions t
         ON t.id = w.transaction_id
        AND t.user_id = w.user_id
       WHERE t.source_reference = $1
         AND w.user_id = $2
       FOR UPDATE OF w, t`,
      [verified.external_reference, owner.user_id]
    );

    const withdrawal = withdrawalResult.rows[0];

    if (
      !withdrawal ||
      withdrawal.transaction_type !== "WITHDRAWAL" ||
      withdrawal.currency !== "KES" ||
      Number(withdrawal.amount_cents) !== amountCents ||
      Math.round(Number(withdrawal.ledger_amount) * 100) !== amountCents ||
      withdrawal.destination_phone !== verified.phone_number
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "B2C withdrawal details do not match." },
        { status: 409 }
      );
    }

    if (
      withdrawal.payout_id &&
      withdrawal.payout_id !== transaction.id
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "B2C payout ID mismatch." },
        { status: 409 }
      );
    }

    if (
      withdrawal.status === "PAID" &&
      isSuccess
    ) {
      await client.query("COMMIT");
      return NextResponse.json({
        received: true,
        alreadyProcessed: true,
        status: "PAID"
      });
    }

    if (
      withdrawal.status === "FAILED" &&
      isFailure
    ) {
      await client.query("COMMIT");
      return NextResponse.json({
        received: true,
        alreadyProcessed: true,
        status: "FAILED"
      });
    }

    if (
      !["PENDING", "PROCESSING"].includes(withdrawal.status)
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Withdrawal is not in a processable state." },
        { status: 409 }
      );
    }

    if (!isSuccess && !isFailure) {
      await client.query(
        `UPDATE palpluss_withdrawals
         SET status = 'PROCESSING',
             payout_id = COALESCE(payout_id, $1),
             updated_at = NOW()
         WHERE id = $2`,
        [transaction.id, withdrawal.id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        received: true,
        verified: true,
        status: "PROCESSING"
      });
    }

    const amountKES = amountCents / 100;

    if (isSuccess) {
      const walletUpdate = await client.query(
        `UPDATE real_funds_wallets
         SET reserved_balance = reserved_balance - $1,
             updated_at = NOW()
         WHERE id = $2
           AND reserved_balance >= $1
         RETURNING id`,
        [amountKES, wallet.id]
      );

      if (walletUpdate.rowCount !== 1) {
        throw new Error("B2C_RESERVED_BALANCE_SETTLEMENT_FAILED");
      }

      const ledgerUpdate = await client.query(
        `UPDATE real_funds_transactions
         SET status = 'SUCCEEDED',
             metadata = metadata || $2::jsonb
         WHERE id = $1
           AND status = 'PENDING'
         RETURNING id`,
        [
          withdrawal.transaction_id,
          JSON.stringify({
            payoutSent: true,
            provider: "PALPLUSS",
            providerTransactionId: transaction.id,
            verified: true
          })
        ]
      );

      if (ledgerUpdate.rowCount !== 1) {
        throw new Error("B2C_WITHDRAWAL_LEDGER_UPDATE_FAILED");
      }

      await client.query(
        `UPDATE palpluss_withdrawals
         SET status = 'PAID',
             payout_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [transaction.id, withdrawal.id]
      );
    }

    if (isFailure) {
      const walletUpdate = await client.query(
        `UPDATE real_funds_wallets
         SET reserved_balance = reserved_balance - $1,
             available_balance = available_balance + $1,
             updated_at = NOW()
         WHERE id = $2
           AND reserved_balance >= $1
         RETURNING id`,
        [amountKES, wallet.id]
      );

      if (walletUpdate.rowCount !== 1) {
        throw new Error("B2C_WITHDRAWAL_RELEASE_FAILED");
      }

      const ledgerUpdate = await client.query(
        `UPDATE real_funds_transactions
         SET status = 'FAILED',
             metadata = metadata || $2::jsonb
         WHERE id = $1
           AND status = 'PENDING'
         RETURNING id`,
        [
          withdrawal.transaction_id,
          JSON.stringify({
            payoutSent: false,
            provider: "PALPLUSS",
            providerTransactionId: transaction.id,
            verified: true,
            failureReason: verified.result_desc ?? providerStatus
          })
        ]
      );

      if (ledgerUpdate.rowCount !== 1) {
        throw new Error("B2C_WITHDRAWAL_FAILURE_UPDATE_FAILED");
      }

      await client.query(
        `UPDATE palpluss_withdrawals
         SET status = 'FAILED',
             payout_id = $1,
             failure_reason = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [
          transaction.id,
          verified.result_desc ?? providerStatus,
          withdrawal.id
        ]
      );

      const release = await client.query(
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
         VALUES (
           $1,
           'WITHDRAWAL_RELEASE',
           'SUCCEEDED',
           $2,
           'KES',
           $3,
           $4,
           $5::jsonb
         )
         RETURNING id`,
        [
          withdrawal.user_id,
          amountKES,
          `PALPLUSS_WITHDRAWAL_RELEASE:${withdrawal.transaction_id}`,
          `palwd_release_${withdrawal.transaction_id}`,
          JSON.stringify({
            provider: "PALPLUSS",
            originalWithdrawalId: withdrawal.transaction_id,
            providerTransactionId: transaction.id,
            verified: true,
            failureReason: verified.result_desc ?? providerStatus
          })
        ]
      );

      if (release.rowCount !== 1) {
        throw new Error("B2C_WITHDRAWAL_RELEASE_LEDGER_FAILED");
      }
    }

    await client.query("COMMIT");

    return NextResponse.json({
      received: true,
      verified: true,
      status: isSuccess ? "PAID" : "FAILED"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("PalPluss B2C webhook processing failed:", error);

    return NextResponse.json(
      { error: "B2C webhook processing failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

if (verified.type !== "STK") {
  return NextResponse.json(
    { error: "Unsupported Palpluss transaction type." },
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

  if (
  !["SUCCESS", "FAILED", "CANCELLED", "EXPIRED", "REVERSED"].includes(
    status ?? ""
  )
) {
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
  `SELECT
     d.id,
     d.transaction_id,
     d.user_id,
     d.amount_cents,
     d.status,
     d.phone_number,
     d.palpluss_transaction_id,
     t.amount AS transaction_amount,
     t.status AS transaction_status
   FROM palpluss_deposits d
   JOIN real_money_transactions t
     ON t.id = d.transaction_id
    AND t.user_id = d.user_id
   WHERE d.reference = $1
   FOR UPDATE OF d, t`,
  [verified.external_reference]
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
  deposit.palpluss_transaction_id &&
  deposit.palpluss_transaction_id !== transaction.id
) {
  await client.query("ROLLBACK");

  return NextResponse.json(
    { error: "Palpluss transaction ID does not match." },
    { status: 400 }
  );
}

 if (
  Number(deposit.amount_cents) !== amountCents ||
  Math.round(Number(deposit.transaction_amount) * 100) !== amountCents ||
  verified.phone_number !== deposit.phone_number
) {
      await client.query("ROLLBACK");

      return NextResponse.json(
       { error: "Deposit amount or phone number does not match." },
        { status: 400 }
      );
    }
   if (verified.status === "REVERSED") {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      transaction.id
    );

  if (!isUuid || !webhookId || webhookId.length > 256) {
    await client.query("ROLLBACK");

    return NextResponse.json(
      { error: "Invalid reversal identifiers." },
      { status: 400 }
    );
  }

  if (
    deposit.palpluss_transaction_id &&
    deposit.palpluss_transaction_id !== transaction.id
  ) {
    await client.query("ROLLBACK");

    return NextResponse.json(
      { error: "Reversal transaction does not match the deposit." },
      { status: 409 }
    );
  }

  const reversal = await client.query(
    `INSERT INTO palpluss_reversals (
       webhook_id,
       palpluss_transaction_id,
       deposit_id,
       transaction_id,
       user_id,
       amount_cents,
       currency,
       reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'KES',
             'PalPluss reported a reversed payment')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      webhookId,
      transaction.id,
      deposit.id,
      deposit.transaction_id,
      deposit.user_id,
      amountCents
    ]
  );

  if (reversal.rowCount !== 1) {
    const existingWebhook = await client.query(
      `SELECT palpluss_transaction_id, deposit_id,
              transaction_id, user_id, amount_cents
       FROM palpluss_reversals
       WHERE webhook_id = $1`,
      [webhookId]
    );

    const existingTransaction = await client.query(
      `SELECT webhook_id, deposit_id, transaction_id,
              user_id, amount_cents
       FROM palpluss_reversals
       WHERE palpluss_transaction_id = $1`,
      [transaction.id]
    );

    const matches = (row: typeof existingWebhook.rows[number]) =>
      row.deposit_id === deposit.id &&
      row.transaction_id === deposit.transaction_id &&
      row.user_id === deposit.user_id &&
      Number(row.amount_cents) === amountCents;

    const sameWebhook =
      existingWebhook.rows.length === 1 &&
      existingWebhook.rows[0].palpluss_transaction_id === transaction.id &&
      matches(existingWebhook.rows[0]);

    const sameTransaction =
      existingTransaction.rows.length === 1 &&
      existingTransaction.rows[0].webhook_id === webhookId &&
      matches(existingTransaction.rows[0]);

    if (!sameWebhook || !sameTransaction) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Reversal identifier conflict requires investigation." },
        { status: 409 }
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      received: true,
      verified: true,
      reversalAlreadyRecorded: true
    });
  }

  if (
    deposit.status !== "SUCCEEDED" ||
    deposit.transaction_status !== "SUCCEEDED"
  ) {
    await client.query("ROLLBACK");

    return NextResponse.json(
      { error: "Only a successfully credited deposit can be reversed." },
      { status: 409 }
    );
  }

  if (!deposit.palpluss_transaction_id) {
    await client.query(
      `UPDATE palpluss_deposits
       SET palpluss_transaction_id = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [transaction.id, deposit.id]
    );
  }

  await client.query(
    `INSERT INTO real_funds_wallets (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [deposit.user_id]
  );

  const walletResult = await client.query(
    `SELECT id, available_balance
     FROM real_funds_wallets
     WHERE user_id = $1
     FOR UPDATE`,
    [deposit.user_id]
  );

  if (walletResult.rowCount !== 1) {
    throw new Error("Genuine-funds wallet missing during reversal.");
  }

  const available = Number(walletResult.rows[0].available_balance);
  const reversalAmount = amountCents / 100;

  if (!Number.isFinite(available) || available < 0) {
    throw new Error("Invalid genuine-funds balance.");
  }

  const recovered = Math.min(available, reversalAmount);
  const outstanding = reversalAmount - recovered;

  const walletUpdate = await client.query(
    `UPDATE real_funds_wallets
     SET available_balance = available_balance - $1,
         reversal_due = reversal_due + $2,
         is_frozen = is_frozen OR ($2 > 0),
         updated_at = NOW()
     WHERE id = $3
       AND available_balance >= $1
     RETURNING id`,
    [recovered, outstanding, walletResult.rows[0].id]
  );

  if (walletUpdate.rowCount !== 1) {
    throw new Error("Genuine-funds reversal debit failed.");
  }

  const ledger = await client.query(
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
     VALUES (
       $1,
       'DEPOSIT_REVERSAL',
       $2,
       $3,
       'KES',
       $4,
       $4,
       $5::jsonb
     )
     RETURNING id`,
    [
      deposit.user_id,
      outstanding === 0 ? "SUCCEEDED" : "PENDING",
      reversalAmount,
      `PALPLUSS_REVERSAL:${deposit.id}`,
      JSON.stringify({
        provider: "PALPLUSS",
        providerTransactionId: transaction.id,
        verified: true,
        recoveredAmount: recovered,
        outstandingAmount: outstanding,
        currency: "KES"
      })
    ]
  );

  if (ledger.rowCount !== 1) {
    throw new Error("Genuine-funds reversal ledger entry failed.");
  }

  await client.query(
    `UPDATE palpluss_deposits
     SET status = 'REVERSED',
         updated_at = NOW()
     WHERE id = $1`,
    [deposit.id]
  );

  await client.query("COMMIT");

  return NextResponse.json({
    received: true,
    verified: true,
    reversalRecorded: true,
    recoveredAmount: recovered,
    outstandingAmount: outstanding,
    walletFrozen: outstanding > 0
  });
}

    if (!deposit.palpluss_transaction_id) {
  await client.query(
    `UPDATE palpluss_deposits
     SET palpluss_transaction_id = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [transaction.id, deposit.id]
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
       typeof transaction.mpesa_receipt === "string" && transaction.mpesa_receipt.trim()
  ? transaction.mpesa_receipt.trim()
  : null,
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

   if (nextStatus === "SUCCEEDED") {
     

     // Credit genuine funds only after repaying any outstanding reversal.
      await client.query(
        `INSERT INTO real_funds_wallets (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [deposit.user_id]
      );

      const genuineWallet = await client.query(
        `SELECT id, available_balance, reversal_due
         FROM real_funds_wallets
         WHERE user_id = $1
         FOR UPDATE`,
        [deposit.user_id]
      );

      if (genuineWallet.rowCount !== 1) {
        throw new Error("Genuine-funds wallet missing.");
      }

      const availableBalance = Number(
        genuineWallet.rows[0].available_balance
      );
      const reversalDue = Number(
        genuineWallet.rows[0].reversal_due
      );

      const reversalDueCents = Math.round(reversalDue * 100);

      if (
        !Number.isFinite(availableBalance) ||
        availableBalance < 0 ||
        !Number.isFinite(reversalDue) ||
        reversalDue < 0 ||
        !Number.isSafeInteger(reversalDueCents) ||
        Math.abs(reversalDue * 100 - reversalDueCents) > 0.000001
      ) {
        throw new Error("Invalid genuine-funds wallet amounts.");
      }

      const appliedToReversalCents = Math.min(
        amountCents,
        reversalDueCents
      );

      const availableCreditCents =
        amountCents - appliedToReversalCents;

      const remainingReversalCents =
        reversalDueCents - appliedToReversalCents;

      const genuineCredit = await client.query(
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
         VALUES (
           $1,
           'DEPOSIT',
           'SUCCEEDED',
           $2,
           'KES',
           $3,
           $3,
           $4::jsonb
         )
         RETURNING id`,
        [
          deposit.user_id,
          amountCents / 100,
          `PALPLUSS_DEPOSIT:${deposit.id}`,
          JSON.stringify({
            provider: "PALPLUSS",
            providerTransactionId: transaction.id,
            verified: true,
            depositAmount: amountCents / 100,
            appliedToReversal: appliedToReversalCents / 100,
            availableCredit: availableCreditCents / 100,
            remainingReversalDue: remainingReversalCents / 100
          })
        ]
      );

      if (genuineCredit.rowCount !== 1) {
        throw new Error("Genuine-funds deposit ledger failed.");
      }

      const genuineWalletUpdate = await client.query(
        `UPDATE real_funds_wallets
         SET available_balance = available_balance + $1::numeric,
             reversal_due = $2::numeric,
             is_frozen = ($2::numeric > 0),
             updated_at = NOW()
         WHERE id = $3
           AND reversal_due = $4::numeric
         RETURNING id`,
        [
          availableCreditCents / 100,
          remainingReversalCents / 100,
          genuineWallet.rows[0].id,
          reversalDueCents / 100
        ]
      );

      if (genuineWalletUpdate.rowCount !== 1) {
        throw new Error("Genuine-funds wallet credit failed.");
      }
      
    }

    await client.query("COMMIT");

    return NextResponse.json({
      received: true,
      verified: true,
      status: nextStatus,
      walletCredited: nextStatus === "SUCCEEDED"
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
