
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    const response = NextResponse.json(
      { error: "Please sign in again to view your demo wallet." },
      { status: 401 }
    );
    response.cookies.delete("aurevex_session");
    return response;
  }

  try {
    const result = await db.query(
      `SELECT virtual_balance
       FROM demo_wallets
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Demo wallet not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        virtualBalance: Number(result.rows[0].virtual_balance),
        currency: "USD",
        accountType: "DEMO"
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    console.error("Wallet lookup error:", error);

    return NextResponse.json(
      { error: "Could not load your demo wallet." },
      { status: 500 }
    );
  }
}
