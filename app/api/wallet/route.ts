
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.AUREVEX_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "Server authentication is not configured." },
      { status: 500 }
    );
  }

  const token = request.cookies.get("aurevex_session")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Please log in to view your demo wallet." },
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
      `SELECT virtual_balance
       FROM demo_wallets
       WHERE user_id = $1
       LIMIT 1`,
      [payload.sub]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Demo wallet not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      virtualBalance: Number(result.rows[0].virtual_balance),
      currency: "USD",
      accountType: "DEMO"
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Wallet lookup error:", error);

    return NextResponse.json(
      { error: "Session could not be verified. Please log in again." },
      { status: 401 }
    );
  }
}
