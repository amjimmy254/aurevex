import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

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

    return { id: payload.sub as string };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);

  if (!admin) {
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
  const reason = body.reason;

  if (
    typeof withdrawalId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(withdrawalId)
  ) {
    return NextResponse.json(
      { error: "A valid withdrawal ID is required." },
      { status: 400 }
    );
  }

  if (
    typeof reason !== "string" ||
    reason.trim().length < 5 ||
    reason.trim().length > 500
  ) {
    return NextResponse.json(
      { error: "A rejection reason between 5 and 500 characters is required." },
      { status: 400 }
    );
  }

  const client = await db.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const withdrawalResult = await client.query(
      `SELECT
         id,
         user_id,
         transaction_type,
         status,
         amount,
         currency,
         metadata
       FROM real_funds_transactions
       WHERE id = $1
       FOR UPDATE`,
      [withdrawalId]
    );

    const withdrawal = withdrawalResult.rows[0];

    if (
      !withdrawal ||
      withdrawal.transaction_type !== "WITHDRAWAL" ||
      withdrawal.currency !== "KES" ||
      !withdrawal.metadata ||
      withdrawal.metadata.provider !== "PALPLUSS"
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Valid PalPluss withdrawal not found." },
        { status: 404 }
      );
    }

    const releaseResult = await client.query(
      `SELECT id
       FROM real_funds_transactions
       WHERE transaction_type = 'WITHDRAWAL_RELEASE'
         AND metadata->>'originalWithdrawalId' = $1
       LIMIT 1
       FOR UPDATE`,
      [withdrawalId]
    );

    if (releaseResult.rows[0]) {
      if (withdrawal.status === "FAILED") {
        await client.query("COMMIT");
        transactionOpen = false;

        return NextResponse.json({
          success: true,
          alreadyReleased: true,
          releaseId: releaseResult.rows[0].id,
          payoutSent: false
        });
      }

      throw new Error("WITHDRAWAL_RELEASE_STATE_MISMATCH");
    }

    if (withdrawal.status !== "PENDING") {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Only pending withdrawals can be rejected." },
        { status: 409 }
      );
    }

    const amount = withdrawal.amount;

    if (!amount || Number(amount) <= 0) {
      throw new Error("INVALID_WITHDRAWAL_AMOUNT");
    }

    const walletResult = await client.query(
      `SELECT id, reserved_balance, currency
       FROM real_funds_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [withdrawal.user_id]
    );

    const wallet = walletResult.rows[0];

    if (!wallet || wallet.currency !== "KES") {
      throw new Error("GENUINE_FUNDS_WALLET_NOT_FOUND");
    }

    const walletUpdate = await client.query(
      `UPDATE real_funds_wallets
       SET reserved_balance = reserved_balance - $1,
           available_balance = available_balance + $1,
           updated_at = NOW()
       WHERE id = $2
         AND reserved_balance >= $1
       RETURNING id`,
      [amount, wallet.id]
    );

    if (walletUpdate.rowCount !== 1) {
      throw new Error("INSUFFICIENT_RESERVED_BALANCE");
    }

    const rejectionReason = reason.trim();

    const originalUpdate = await client.query(
      `UPDATE real_funds_transactions
       SET status = 'FAILED',
           metadata = metadata || $2::jsonb
       WHERE id = $1
         AND status = 'PENDING'
       RETURNING id`,
      [
        withdrawalId,
        JSON.stringify({
          rejectedAt: new Date().toISOString(),
          rejectedBy: admin.id,
          rejectionReason,
          payoutSent: false
        })
      ]
    );

    if (originalUpdate.rowCount !== 1) {
      throw new Error("WITHDRAWAL_STATUS_UPDATE_FAILED");
    }

    const releaseInsert = await client.query(
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
        amount,
        `PALPLUSS_WITHDRAWAL_RELEASE:${withdrawalId}`,
        `palwd_release_${withdrawalId}`,
        JSON.stringify({
          provider: "PALPLUSS",
          originalWithdrawalId: withdrawalId,
          rejectedBy: admin.id,
          rejectionReason,
          payoutSent: false
        })
      ]
    );

    if (releaseInsert.rowCount !== 1) {
      throw new Error("WITHDRAWAL_RELEASE_LEDGER_FAILED");
    }

    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json({
      success: true,
      withdrawalId,
      releaseId: releaseInsert.rows[0].id,
      status: "FAILED",
      releasedAmount: String(amount),
      currency: "KES",
      payoutSent: false
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }

    console.error("Admin PalPluss withdrawal rejection failed:", error);

    return NextResponse.json(
      { error: "Could not safely reject this withdrawal." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
