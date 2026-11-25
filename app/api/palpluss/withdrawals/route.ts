import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { normalizeKenyanPhone } from "@/lib/cyzora";
import { createPalplussB2cPayout } from "@/lib/palpluss";

export const runtime = "nodejs";

// Keep disabled until the complete integration is verified.
const WITHDRAWAL_REQUESTS_ENABLED = false;

async function submitPalplussPayout(input: {
  userId: string;
  transactionId: string;
  phone: string;
  amountKES: number;
  reference: string;
  idempotencyKey: string;
  callbackUrl: string;
}) {
  const payout = await createPalplussB2cPayout({
    phone: input.phone,
    amount: input.amountKES,
    reference: input.reference,
    idempotencyKey: input.idempotencyKey,
    callbackUrl: input.callbackUrl
  });

  const client = await db.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const updated = await client.query(
      `UPDATE palpluss_withdrawals
       SET payout_id = $1,
           status = 'PROCESSING',
           updated_at = NOW()
       WHERE transaction_id = $2
         AND user_id = $3
         AND status IN ('PENDING', 'PROCESSING')
         AND (payout_id IS NULL OR payout_id = $1)
       RETURNING payout_id, status`,
      [payout.transactionId, input.transactionId, input.userId]
    );

    let finalStatus = updated.rows[0]?.status;

    if (updated.rowCount !== 1) {
      const current = await client.query(
        `SELECT payout_id, status
         FROM palpluss_withdrawals
         WHERE transaction_id = $1
           AND user_id = $2
         FOR UPDATE`,
        [input.transactionId, input.userId]
      );

      if (
        !current.rows[0] ||
        current.rows[0].payout_id !== payout.transactionId
      ) {
        throw new Error("PALPLUSS_PAYOUT_RECORD_MISMATCH");
      }

      finalStatus = current.rows[0].status;
    }

    const ledgerUpdate = await client.query(
      `UPDATE real_funds_transactions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1
         AND user_id = $3
         AND transaction_type = 'WITHDRAWAL'
       RETURNING id`,
      [
        input.transactionId,
        JSON.stringify({
          provider: "PALPLUSS",
          providerRequestAccepted: true,
          providerTransactionId: payout.transactionId
        }),
        input.userId
      ]
    );

    if (ledgerUpdate.rowCount !== 1) {
      throw new Error("PALPLUSS_PAYOUT_LEDGER_UPDATE_FAILED");
    }

    await client.query("COMMIT");
    transactionOpen = false;

    return {
      payoutId: payout.transactionId,
      status: finalStatus ?? "PROCESSING"
    };
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

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
    !/^[a-zA-Z0-9_-]{8,63}$/.test(clientKey)
  ) {
    return NextResponse.json(
      { error: "A valid idempotency key is required." },
      { status: 400 }
    );
  }

  const amountKES = amount / 100;
  const idempotencyKey = `palwd_${userId}_${clientKey}`;
  const sourceReference = `PALPLUSS_WITHDRAWAL:${userId}:${clientKey}`;
const callbackUrl = process.env.PALPLUSS_CALLBACK_URL;

if (
  !callbackUrl ||
  !callbackUrl.startsWith("https://") ||
  !callbackUrl.endsWith("/api/palpluss/webhook")
) {
  return NextResponse.json(
    { error: "PalPluss callback URL is not configured correctly." },
    { status: 500 }
  );
}

  const client = await db.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    await client.query(
      `INSERT INTO real_funds_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const walletResult = await client.query(
      `SELECT
         id,
         user_id,
         currency,
         available_balance,
         reserved_balance,
         is_frozen,
         reversal_due
       FROM real_funds_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet || wallet.currency !== "KES") {
      throw new Error("GENUINE_FUNDS_WALLET_NOT_FOUND");
    }

    const existing = await client.query(
      `SELECT
         t.id,
         t.user_id,
         t.transaction_type,
         t.status,
         t.amount,
         t.currency,
         t.metadata,
         (
           SELECT w.status
           FROM palpluss_withdrawals w
           WHERE w.transaction_id = t.id
           LIMIT 1
         ) AS payout_status,
         (
           SELECT w.payout_id
           FROM palpluss_withdrawals w
           WHERE w.transaction_id = t.id
           LIMIT 1
         ) AS payout_id
       FROM real_funds_transactions t
       WHERE t.idempotency_key = $1
       FOR UPDATE OF t`,
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

      const previousStatus =
        previous.payout_status ?? previous.status;

      if (
        previous.payout_id ||
        !["PENDING", "PROCESSING"].includes(previousStatus)
      ) {
        await client.query("COMMIT");
        transactionOpen = false;

        return NextResponse.json({
          success: true,
          withdrawalId: previous.id,
          status: previousStatus,
          payoutId: previous.payout_id ?? null,
          amount: amountKES,
          currency: "KES",
          payoutSent: Boolean(previous.payout_id),
          message: previous.payout_id
            ? "Existing PalPluss payout found."
            : "This withdrawal is already in a final or non-retryable state."
        });
      }

      await client.query("COMMIT");
      transactionOpen = false;

      try {
        const payout = await submitPalplussPayout({
          userId,
          transactionId: previous.id,
          phone,
          amountKES,
          reference: sourceReference,
          idempotencyKey,
          callbackUrl
        });

        return NextResponse.json({
          success: true,
          withdrawalId: previous.id,
          status: payout.status,
          payoutId: payout.payoutId,
          amount: amountKES,
          currency: "KES",
          payoutSent: true,
          message: "PalPluss payout request accepted. Awaiting provider confirmation."
        });
      } catch (error) {
        console.error(
          "PalPluss payout retry requires reconciliation:",
          error
        );

        return NextResponse.json(
          {
            success: true,
            withdrawalId: previous.id,
            status: previousStatus,
            payoutId: null,
            amount: amountKES,
            currency: "KES",
            payoutSent: false,
            message: "Withdrawal remains pending. Provider payout status needs confirmation."
          },
          { status: 202 }
        );
      }
    }

    if (wallet.is_frozen === true || Number(wallet.reversal_due) > 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        {
          error: "Withdrawals are blocked while your wallet has an outstanding reversal."
        },
        { status: 403 }
      );
    }

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
          mode: "palpluss_b2c",
          payoutSent: false
        })
      ]
    );

    if (ledgerResult.rowCount !== 1) {
      throw new Error("GENUINE_FUNDS_WITHDRAWAL_LEDGER_FAILED");
    }

    await client.query(
      `INSERT INTO palpluss_withdrawals (
         user_id,
         transaction_id,
         idempotency_key,
         destination_phone,
         amount_cents,
         status
       )
       VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
      [
        userId,
        ledgerResult.rows[0].id,
        idempotencyKey,
        phone,
        amount
      ]
    );

    await client.query("COMMIT");
    transactionOpen = false;

    const withdrawalId = ledgerResult.rows[0].id;

    try {
      const payout = await submitPalplussPayout({
        userId,
        transactionId: withdrawalId,
        phone,
        amountKES,
        reference: sourceReference,
        idempotencyKey,
        callbackUrl
      });

      return NextResponse.json(
        {
          success: true,
          withdrawalId,
          status: payout.status,
          payoutId: payout.payoutId,
          amount: amountKES,
          currency: "KES",
          payoutSent: true,
          message: "PalPluss payout request accepted. Awaiting provider confirmation."
        },
        { status: 201 }
      );
    } catch (error) {
      console.error(
        "PalPluss payout submission requires reconciliation:",
        error
      );

      return NextResponse.json(
        {
          success: true,
          withdrawalId,
          status: "PENDING",
          payoutId: null,
          amount: amountKES,
          currency: "KES",
          payoutSent: false,
          message: "Withdrawal recorded. Provider payout status needs confirmation."
        },
        { status: 202 }
      );
    }
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }

    console.error(
      "PalPluss genuine-funds withdrawal request failed:",
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
