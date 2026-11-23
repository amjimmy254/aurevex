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

  const requestedLimit = Number(
    request.nextUrl.searchParams.get("limit") || 50
  );

  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;

  try {
    const result = await db.query(
     `SELECT
         id,
         asset,
         contract_type,
         direction,
         amount,
         currency,
         expiry_seconds,
         entry_digit,
         expiry_digit,
         status,
         payout,
         profit,
         created_at,
         settled_at
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
