import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  try {
    const result = await db.query(
      `SELECT theme FROM app_users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { theme: result.rows[0].theme },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Theme load error:", error);
    return NextResponse.json(
      { error: "Could not load theme." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const theme = body.theme;

    if (theme !== "DARK" && theme !== "LIGHT") {
      return NextResponse.json(
        { error: "Invalid theme." },
        { status: 400 }
      );
    }

    const result = await db.query(
      `UPDATE app_users
       SET theme = $1
       WHERE id = $2
       RETURNING theme`,
      [theme, userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, theme: result.rows[0].theme },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Theme update error:", error);
    return NextResponse.json(
      { error: "Could not save theme." },
      { status: 500 }
    );
  }
}
