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

    const user = result.rows[0];

    if (
      !user ||
      user.role !== "ADMIN" ||
      Number(user.session_version) !== payload.sessionVersion
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
    const [tradeStats, trades, transactions] = await Promise.all([
      db.query(
        `SELECT
          COUNT(*)::int AS total_trades,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'WON')::int AS won,
          COUNT(*) FILTER (WHERE status = 'LOST')::int AS lost,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
         FROM demo_trades`
      ),

      db.query(
        `SELECT
          t.id,
          t.asset,
          t.direction,
          t.contract_type,
          t.contract_prediction,
          t.amount::text AS amount,
          t.status,
          t.simulated_result::text AS simulated_result,
          t.created_at,
          t.settled_at,
          u.email,
          u.display_name
         FROM demo_trades t
         JOIN app_users u ON u.id = t.user_id
         ORDER BY t.created_at DESC
         LIMIT 100`
      ),

      db.query(
        `SELECT
          t.id,
          t.wallet_type,
          t.transaction_type,
          t.amount::text AS amount,
          t.note,
          t.created_at,
          u.email,
          u.display_name
         FROM demo_transactions t
         JOIN app_users u ON u.id = t.user_id
         ORDER BY t.created_at DESC
         LIMIT 100`
      )
    ]);

    return NextResponse.json({
      stats: tradeStats.rows[0],
      trades: trades.rows,
      transactions: transactions.rows
    });
  } catch (error) {
    console.error("Admin activity error:", error);

    return NextResponse.json(
      { error: "Could not load administrator activity." },
      { status: 500 }
    );
  }
}
