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

    return { id: payload.sub };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);

  if (!admin) {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 }
    );
  }

  try {
    const [counts, users] = await Promise.all([
      db.query(
        `SELECT
          (SELECT COUNT(*)::int FROM app_users) AS total_users,
          (SELECT COUNT(*)::int FROM app_users WHERE role = 'ADMIN') AS administrators,
          (SELECT COALESCE(SUM(virtual_balance), 0)::text FROM demo_wallets) AS demo_balance_total`
      ),
      db.query(
        `SELECT
          u.id,
          u.email,
          u.display_name,
          u.role,
          u.created_at,
          COALESCE(w.virtual_balance, 0)::text AS demo_balance
        FROM app_users u
        LEFT JOIN demo_wallets w ON w.user_id = u.id
        ORDER BY u.created_at DESC
        LIMIT 100`
      )
    ]);

    return NextResponse.json({
      stats: counts.rows[0],
      users: users.rows
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return NextResponse.json(
      { error: "Could not load administrator data." },
      { status: 500 }
    );
  }
}
