import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { listPalplussB2cTransactions } from "@/lib/palpluss-sdk";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const secret = process.env.AUREVEX_SESSION_SECRET;
  const token = request.cookies.get("aurevex_session")?.value;

  if (!secret || secret.length < 32 || !token) return false;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    if (!payload.sub || !Number.isInteger(payload.sessionVersion)) {
      return false;
    }

    const result = await db.query(
      `SELECT role, session_version
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [payload.sub]
    );

    const admin = result.rows[0];

    return Boolean(
      admin &&
      admin.role === "ADMIN" &&
      Number(admin.session_version) === payload.sessionVersion
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 }
    );
  }

  try {
    const pending = await db.query(
      `SELECT
         t.id AS withdrawal_id,
         t.source_reference,
         t.amount,
         t.currency,
         t.metadata->>'phone' AS phone,
         w.status AS withdrawal_status,
         w.payout_id
       FROM real_funds_transactions t
       JOIN palpluss_withdrawals w
         ON w.transaction_id = t.id
        AND w.user_id = t.user_id
       WHERE t.transaction_type = 'WITHDRAWAL'
         AND t.status = 'PENDING'
         AND t.metadata->>'provider' = 'PALPLUSS'
         AND w.status IN ('PENDING', 'PROCESSING')
         AND w.payout_id IS NULL
       ORDER BY t.created_at ASC
       LIMIT 100`
    );

    const providerTransactions = [];
    let cursor: string | undefined;
    let pagesScanned = 0;

    do {
      const page = await listPalplussB2cTransactions(cursor);

      providerTransactions.push(...page.items);
      cursor = page.next_cursor ?? undefined;
      pagesScanned += 1;
    } while (cursor && pagesScanned < 10);

    const results = pending.rows.map((withdrawal) => {
      const matches = providerTransactions.filter((transaction) =>
        transaction.type === "B2C" &&
        transaction.external_reference === withdrawal.source_reference &&
        transaction.currency === withdrawal.currency &&
        transaction.phone_number === withdrawal.phone &&
        Number(transaction.amount) === Number(withdrawal.amount)
      );

      return {
        withdrawalId: withdrawal.withdrawal_id,
        reference: withdrawal.source_reference,
        amount: Number(withdrawal.amount),
        currency: withdrawal.currency,
        phone: withdrawal.phone,
        currentStatus: withdrawal.withdrawal_status,
        providerMatches: matches.map((transaction) => ({
          transactionId: transaction.transaction_id,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          phone: transaction.phone_number,
          externalReference: transaction.external_reference
        })),
       reconciliation:
  matches.length > 1
    ? "MULTIPLE_PROVIDER_MATCHES"
    : matches.length === 1
      ? "ONE_PROVIDER_MATCH"
      : cursor
        ? "SEARCH_INCOMPLETE"
        : "NO_PROVIDER_MATCH"
      };
    });

    return NextResponse.json(
      {
        readOnly: true,
        pagesScanned,
        providerHistoryMayBeIncomplete:
          Boolean(cursor),
        withdrawals: results
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("PalPluss withdrawal reconciliation lookup failed:", error);

    return NextResponse.json(
      { error: "Could not reconcile PalPluss withdrawals." },
      { status: 503 }
    );
  }
}
