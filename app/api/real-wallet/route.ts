import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to view your wallet." },
      { status: 401 }
    );
  }

  try {
    await db.query(
      `INSERT INTO real_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const result = await db.query(
      `SELECT available_balance, reserved_balance, currency
       FROM real_wallets
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Real wallet not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        availableBalance: Number(result.rows[0].available_balance),
        reservedBalance: Number(result.rows[0].reserved_balance),
        currency: result.rows[0].currency,
        accountType: "TEST"
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    console.error("Real wallet lookup error:", error);

    return NextResponse.json(
      { error: "Could not load your real wallet." },
      { status: 500 }
    );
  }
}
