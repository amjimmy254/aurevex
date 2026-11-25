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

    return true;
  } catch {
    return null;
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
    const result = await db.query(
      `SELECT
         t.id,
         t.user_id,
         u.email,
         u.display_name,
         t.amount::text AS amount,
         t.currency,
         t.status,
         t.metadata->>'phone' AS phone,
         t.created_at,
         w.reserved_balance::text AS reserved_balance,
         w.is_frozen,
         w.reversal_due::text AS reversal_due
       FROM real_funds_transactions t
       JOIN app_users u ON u.id = t.user_id
       LEFT JOIN real_funds_wallets w ON w.user_id = t.user_id
       WHERE t.transaction_type = 'WITHDRAWAL'
         AND t.status = 'PENDING'
         AND t.metadata->>'provider' = 'PALPLUSS'
       ORDER BY t.created_at ASC
       LIMIT 100`
    );

    return NextResponse.json(
      { withdrawals: result.rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin withdrawal review error:", error);

    return NextResponse.json(
      { error: "Could not load withdrawal requests." },
      { status: 500 }
    );
  }
}
