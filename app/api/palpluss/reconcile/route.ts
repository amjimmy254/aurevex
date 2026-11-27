import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getPalplussSdkTransaction } from "@/lib/palpluss-sdk";

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

  const reference = body.reference;

  if (
    typeof reference !== "string" ||
    !/^AUR[A-Z0-9]{9}$/.test(reference)
  ) {
    return NextResponse.json(
      { error: "Invalid deposit reference." },
      { status: 400 }
    );
  }

  const pending = await db.query(
    `SELECT
       d.id,
       d.reference,
       d.status,
       d.palpluss_transaction_id
     FROM palpluss_deposits d
     WHERE d.reference = $1
       AND d.user_id = $2
     LIMIT 1`,
    [reference, userId]
  );

  const depositRecord = pending.rows[0];

  if (!depositRecord) {
    return NextResponse.json(
      { error: "Deposit not found." },
      { status: 404 }
    );
  }

  if (depositRecord.status !== "AWAITING_PAYMENT") {
    return NextResponse.json({
      success: true,
      status: depositRecord.status,
      alreadyProcessed: true
    });
  }

  if (!depositRecord.palpluss_transaction_id) {
    return NextResponse.json({
      success: false,
      status: "PROCESSING",
      message: "The provider transaction ID is not available yet."
    }, { status: 202 });
  }

  let verified;

  try {
    verified = await getPalplussSdkTransaction(
      depositRecord.palpluss_transaction_id
    );
  } catch (error) {
    console.error("PalPluss deposit reconciliation lookup failed:", error);

    return NextResponse.json(
      { error: "Could not verify payment with PalPluss. Please try again." },
      { status: 503 }
    );
  }

  if (
    verified.transaction_id !== depositRecord.palpluss_transaction_id ||
    verified.type !== "STK" ||
    verified.currency !== "KES" ||
    verified.external_reference !== reference ||
    !Number.isFinite(Number(verified.amount)) ||
    typeof verified.phone_number !== "string"
  ) {
    return NextResponse.json(
      { error: "PalPluss transaction verification failed." },
      { status: 409 }
    );
  }

  if (
    !["SUCCESS", "FAILED", "CANCELLED", "EXPIRED"].includes(
      verified.status ?? ""
    )
  ) {
    return NextResponse.json({
      success: false,
      status: "PROCESSING",
      message: "PalPluss has not confirmed the final payment status yet."
    }, { status: 202 });
  }

  const amountCents = Number(verified.amount) * 100;

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 100
  ) {
    return NextResponse.json(
      { error: "Invalid verified payment amount." },
      { status: 409 }
    );
  }

  const nextStatus =
    verified.status === "SUCCESS"
      ? "SUCCEEDED"
      : verified.status === "CANCELLED" ||
          verified.status === "FAILED"
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
         d.reference,
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
         AND d.user_id = $2
       FOR UPDATE OF d, t`,
      [reference, userId]
    );

    const deposit = result.rows[0];

    if (!deposit) {
      throw new Error("Matching deposit not found.");
    }

    if (deposit.status !== "AWAITING_PAYMENT") {
      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        status: deposit.status,
        alreadyProcessed: true
      });
    }

    if (
      deposit.palpluss_transaction_id !== verified.transaction_id ||
      Number(deposit.amount_cents) !== amountCents ||
      Math.round(Number(deposit.transaction_amount) * 100) !== amountCents ||
      deposit.phone_number !== verified.phone_number ||
      deposit.transaction_status !== "PENDING"
    ) {
      throw new Error("Stored deposit details do not match PalPluss.");
    }

    const receipt =
      typeof verified.mpesa_receipt === "string" &&
      verified.mpesa_receipt.trim()
        ? verified.mpesa_receipt.trim()
        : null;

    const transactionUpdate = await client.query(
      `UPDATE real_money_transactions
       SET status = $1,
           provider_reference = $2,
           updated_at = NOW()
       WHERE id = $3
         AND user_id = $4
         AND transaction_type = 'DEPOSIT'
         AND provider = 'PALPLUSS'
         AND status = 'PENDING'
       RETURNING id`,
      [
        nextStatus,
        verified.transaction_id,
        deposit.transaction_id,
        userId
      ]
    );

    if (transactionUpdate.rowCount !== 1) {
      throw new Error("Linked deposit transaction could not be updated.");
    }

    await client.query(
      `UPDATE palpluss_deposits
       SET status = $1,
           mpesa_receipt = $2,
           updated_at = NOW()
       WHERE id = $3
         AND status = 'AWAITING_PAYMENT'`,
      [nextStatus, receipt, deposit.id]
    );

    if (nextStatus === "SUCCEEDED") {
      await client.query(
        `INSERT INTO real_funds_wallets (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      const walletResult = await client.query(
        `SELECT id, available_balance, reversal_due
         FROM real_funds_wallets
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );

      if (walletResult.rowCount !== 1) {
        throw new Error("Genuine-funds wallet missing.");
      }

      const availableBalance = Number(
        walletResult.rows[0].available_balance
      );

      const reversalDue = Number(
        walletResult.rows[0].reversal_due
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
          userId,
          amountCents / 100,
          `PALPLUSS_DEPOSIT:${deposit.id}`,
          JSON.stringify({
            provider: "PALPLUSS",
            providerTransactionId: verified.transaction_id,
            verified: true,
            reconciliation: true,
            depositAmount: amountCents / 100,
            appliedToReversal: appliedToReversalCents / 100,
            availableCredit: availableCreditCents / 100,
            remainingReversalDue: remainingReversalCents / 100
          })
        ]
      );

      if (ledger.rowCount !== 1) {
        throw new Error("Deposit ledger entry failed.");
      }

      const walletUpdate = await client.query(
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
          walletResult.rows[0].id,
          reversalDueCents / 100
        ]
      );

      if (walletUpdate.rowCount !== 1) {
        throw new Error("Genuine-funds wallet credit failed.");
      }
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      verified: true,
      status: nextStatus,
      walletCredited: nextStatus === "SUCCEEDED"
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("PalPluss reconciliation failed:", error);

    return NextResponse.json(
      { error: "Deposit reconciliation failed. Please contact support if this continues." },
      { status: 409 }
    );
  } finally {
    client.release();
  }
}
