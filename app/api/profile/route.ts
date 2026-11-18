import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("aurevex_session")?.value;
  const secret = process.env.AUREVEX_SESSION_SECRET;

  if (!token || !secret || secret.length < 32) {
    return NextResponse.json(
      { error: "Please sign in." },
      { status: 401 }
    );
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    if (!payload.sub) {
      return NextResponse.json(
        { error: "Invalid session." },
        { status: 401 }
      );
    }

    const result = await db.query(
      `SELECT
         u.id,
         u.email,
         u.display_name,
         w.virtual_balance
       FROM app_users u
       LEFT JOIN demo_wallets w ON w.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        profile: {
          id: user.id,
          name: user.display_name,
          email: user.email,
          accountType: "Demo",
          virtualBalance: Number(
            user.virtual_balance ?? 0
          ),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }
}
