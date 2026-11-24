
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    const response = NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
    response.cookies.delete("aurevex_session");
    return response;
  }

  try {
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
      [userId]
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
          virtualBalance: Number(user.virtual_balance ?? 0)
        }
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    console.error("Profile error:", error);

    return NextResponse.json(
      { error: "Could not load your profile." },
      { status: 500 }
    );
  }
}
export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    const response = NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
    response.cookies.delete("aurevex_session");
    return response;
  }

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();

    if (!name || name.length > 60) {
      return NextResponse.json(
        { error: "Name must be between 1 and 60 characters." },
        { status: 400 }
      );
    }

    const result = await db.query(
      `UPDATE app_users
       SET display_name = $1
       WHERE id = $2
       RETURNING id, display_name, email`,
      [name, userId]
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
        success: true,
        profile: {
          id: user.id,
          name: user.display_name,
          email: user.email
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Profile update error:", error);

    return NextResponse.json(
      { error: "Could not update your profile." },
      { status: 500 }
    );
  }
}
