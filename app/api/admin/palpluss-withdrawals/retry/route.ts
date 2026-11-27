import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import {
  createPalplussB2cPayout,
} from "@/lib/palpluss";
import {
  listPalplussB2cTransactions,
} from "@/lib/palpluss-sdk";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const secret = process.env.AUREVEX_SESSION_SECRET;
  const token = request.cookies.get("aurevex_session")?.value;

  if (!secret || secret.length < 32 || !token) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    if (!payload.sub || !Number.isInteger(payload.sessionVersion)) {
      return null;
    }

    const result = await db.query(
      `SELECT role, session_version
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [payload.sub]
    );

    const admin = result.rows[0];

    if (
      !admin ||
      admin.role !== "ADMIN" ||
      Number(admin.session_version) !== payload.sessionVersion
    ) {
      return null;
    }

    return true;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 }
    );
  }

  if (!(await requireAdmin(request))) {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 }
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

  const withdrawalId = body.withdrawalId;

  if (
    typeof withdrawalId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(withdrawalId)
  ) {
    return NextResponse.json(
      { error: "A valid withdrawal ID is required." },
      { status: 400 }
    );
  }

  const ownerResult = await db.query(
    `SELECT user_id
     FROM real_funds_transactions
     WHERE id = $1
       AND transaction_type = 'WITHDRAWAL'
       AND metadata->>'provider' = 'PALPLUSS'
     LIMIT 1`,
    [withdrawalId]
  );

  const owner = ownerResult.rows[0];

  if (!owner) {
    return NextResponse.json(
      { error: "PalPluss withdrawal not found." },
      { status: 404 }
    );
  }

  const historyMatches = [];
  let cursor: string | undefined;

  try {
    let complete = false;

    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = await listPalplussB2cTransactions(cursor);

      for (const transaction of page.items || []) {
        if (transaction.external_reference ===
            `PALPLUSS_WITHDRAWAL:${owner.user_id}:${""}`) {
          historyMatches.push(transaction);
        }
      }

      // The exact reference is checked below using the database record.
      if (!page.next_cursor) {
        complete = true;
        break;
      }

      cursor = page.next_cursor;
    }

    if (!complete) {
      return NextResponse.json(
        {
          error: "Provider history search is incomplete. No payout was sent."
        },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("PalPluss history check failed:", error);

    return NextResponse.json(
      {
        error: "Could not verify PalPluss history. No payout was sent."
      },
      { status: 503 }
    );
  }

  const client = await db.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const walletResult = await client.query(
      `SELECT id, reserved_balance, currency, is_frozen, reversal_due
       FROM real_funds_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [owner.user_id]
    );

    const wallet = walletResult.rows[0];

    if (
      !wallet ||
      wallet.currency !== "KES" ||
      wallet.is_frozen ||
      Number(wallet.reversal_due) > 0
    ) {
      throw new Error("WITHDRAWAL_WALLET_NOT_SAFE");
    }

    const ledgerResult = await client.query(
      `SELECT id, user_id, status, amount, currency,
              source_reference, idempotency_key, metadata
       FROM real_funds_transactions
       WHERE id = $1
         AND user_id = $2
         AND transaction_type = 'WITHDRAWAL'
       FOR UPDATE`,
      [withdrawalId, owner.user_id]
    );

    const ledger = ledgerResult.rows[0];

    if (
      !ledger ||
      ledger.status !== "PENDING" ||
      ledger.currency !== "KES" ||
      ledger.metadata?.provider !== "PALPLUSS" ||
      ledger.metadata?.payoutSent === true ||
      !ledger.metadata?.providerSubmissionStarted
    ) {
      throw new Error("WITHDRAWAL_LEDGER_NOT_SAFE");
    }

    const payoutResult = await client.query(
      `SELECT id, status, payout_id, amount_cents,
              destination_phone, idempotency_key
       FROM palpluss_withdrawals
       WHERE transaction_id = $1
         AND user_id = $2
       FOR UPDATE`,
      [withdrawalId, owner.user_id]
    );

    const payoutRecord = payoutResult.rows[0];

    if (
      !payoutRecord ||
      !["PENDING", "PROCESSING"].includes(payoutRecord.status) ||
      payoutRecord.payout_id
    ) {
      throw new Error("WITHDRAWAL_ALREADY_SUBMITTED_OR_NOT_RETRYABLE");
    }

    const amountKES = Number(ledger.amount);
    const amountCents = Number(payoutRecord.amount_cents);
    const phone = payoutRecord.destination_phone;
    const reference = ledger.source_reference;
    const idempotencyKey = ledger.idempotency_key;

    if (
      !Number.isSafeInteger(amountKES) ||
      amountKES <= 0 ||
      amountCents !== amountKES * 100 ||
      Number(wallet.reserved_balance) < amountKES ||
      typeof phone !== "string" ||
      !/^254[17]\d{8}$/.test(phone) ||
      typeof reference !== "string" ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey !== payoutRecord.idempotency_key
    ) {
      throw new Error("WITHDRAWAL_DETAILS_DO_NOT_MATCH");
    }

    const expectedReference =
      `PALPLUSS_WITHDRAWAL:${owner.user_id}:`;

    if (!reference.startsWith(expectedReference)) {
      throw new Error("WITHDRAWAL_REFERENCE_MISMATCH");
    }

    const history = await listPalplussB2cTransactions();

    const matching = (history.items || []).filter(
      (item) => item.external_reference === reference
    );

    if (matching.length > 0) {
      const existing = matching[0];

      if (
        existing.type !== "B2C" ||
        Number(existing.amount) !== amountKES ||
        existing.currency !== "KES" ||
        existing.phone_number !== phone
      ) {
        throw new Error("PROVIDER_TRANSACTION_DETAILS_MISMATCH");
      }

      const saved = await client.query(
        `UPDATE palpluss_withdrawals
         SET payout_id = $1,
             status = 'PROCESSING',
             updated_at = NOW()
         WHERE id = $2
           AND payout_id IS NULL
         RETURNING id`,
        [existing.transaction_id, payoutRecord.id]
      );

      if (saved.rowCount !== 1) {
        throw new Error("EXISTING_PROVIDER_PAYOUT_SAVE_FAILED");
      }

      await client.query(
        `UPDATE real_funds_transactions
         SET metadata = metadata || $2::jsonb
         WHERE id = $1`,
        [
          withdrawalId,
          JSON.stringify({
            provider: "PALPLUSS",
            providerTransactionId: existing.transaction_id,
            providerHistoryMatched: true
          })
        ]
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json({
        success: true,
        payoutAlreadyExists: true,
        payoutId: existing.transaction_id,
        message: "Existing provider payout found. No new payout was created. Await confirmation."
      });
    }

    const callbackUrl = process.env.PALPLUSS_CALLBACK_URL;

    if (
      !callbackUrl ||
      !callbackUrl.startsWith("https://") ||
      !callbackUrl.endsWith("/api/palpluss/webhook")
    ) {
      throw new Error("PALPLUSS_CALLBACK_NOT_CONFIGURED");
    }

    const payout = await createPalplussB2cPayout({
      phone,
      amount: amountKES,
      reference,
      idempotencyKey,
      callbackUrl
    });

    if (
      !payout.transactionId ||
      payout.type !== "B2C" ||
      payout.status !== "PENDING" ||
      Number(payout.amount) !== amountKES ||
      payout.currency !== "KES" ||
      payout.phone !== phone ||
      payout.reference !== reference
    ) {
      throw new Error("PALPLUSS_RESPONSE_VALIDATION_FAILED");
    }

    const saved = await client.query(
      `UPDATE palpluss_withdrawals
       SET payout_id = $1,
           status = 'PROCESSING',
           updated_at = NOW()
       WHERE id = $2
         AND payout_id IS NULL
       RETURNING id`,
      [payout.transactionId, payoutRecord.id]
    );

    if (saved.rowCount !== 1) {
      throw new Error("PAYOUT_DATABASE_UPDATE_FAILED");
    }

    await client.query(
      `UPDATE real_funds_transactions
       SET metadata = metadata || $2::jsonb
       WHERE id = $1`,
      [
        withdrawalId,
        JSON.stringify({
          provider: "PALPLUSS",
          providerRequestAccepted: true,
          providerTransactionId: payout.transactionId,
          payoutSent: true
        })
      ]
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json({
      success: true,
      withdrawalId,
      payoutId: payout.transactionId,
      status: "PROCESSING",
      amount: amountKES,
      currency: "KES",
      message: "PalPluss accepted the payout request. Awaiting signed provider confirmation."
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }

    console.error("Admin PalPluss retry failed:", error);

    return NextResponse.json(
      {
        error: "The payout could not be safely retried. Funds remain reserved. Check provider history before trying again."
      },
      { status: 409 }
    );
  } finally {
    client.release();
  }
}
