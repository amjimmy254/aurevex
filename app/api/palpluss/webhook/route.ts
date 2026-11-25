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
  verified.type !== transaction.type
) {
  return NextResponse.json(
    { error: "Palpluss transaction details do not match." },
    { status: 400 }
  );
}

if (verified.type === "B2C") {
  return NextResponse.json(
    { error: "B2C withdrawal processing is not ready yet." },
    { status: 503 }
  );
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
      const walletUpdate = await client.query(
        `UPDATE real_wallets w
         SET available_balance = w.available_balance + ($1::numeric / 100),
             updated_at = NOW()
         FROM real_money_transactions t
         WHERE t.id = $2
           AND t.wallet_id = w.id
           AND t.user_id = $3
           AND w.user_id = $3
           AND w.currency = 'KES'
           AND t.currency = 'KES'
           AND t.transaction_type = 'DEPOSIT'
           AND t.provider = 'PALPLUSS'
           AND t.status = 'SUCCEEDED'`,
        [amountCents, deposit.transaction_id, deposit.user_id]
      );

      if (walletUpdate.rowCount !== 1) {
        throw new Error("Wallet credit failed.");
      }

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
      if (genuineCredit.rowCount === 1) {
        const genuineWalletUpdate = await client.query(
          `UPDATE real_funds_wallets
           SET available_balance = available_balance + $1,
               updated_at = NOW()
           WHERE user_id = $2
             AND currency = 'KES'`,
          [amountCents / 100, deposit.user_id]
        );

        if (genuineWalletUpdate.rowCount !== 1) {
          throw new Error("Genuine-funds wallet credit failed.");
        }
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
