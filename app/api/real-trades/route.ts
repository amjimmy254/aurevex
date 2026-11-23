import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please log in again." },
      { status: 401 }
    );
  }

  const limit = Math.min(
    Math.max(
      Number(request.nextUrl.searchParams.get("limit") || 50),
      1
    ),
    100
  );

  try {
    const result = await db.query(
      `SELECT *
       FROM real_trades
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return NextResponse.json(
      { trades: result.rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Real trades error:", error);

    return NextResponse.json(
      { error: "Could not load real trades." },
      { status: 500 }
    );
  }
}
