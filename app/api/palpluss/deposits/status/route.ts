import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to check your deposit." },
      { status: 401 }
    );
  }

  const reference = request.nextUrl.searchParams.get("reference");

  if (!reference || reference.length > 100) {
    return NextResponse.json(
      { error: "A valid deposit reference is required." },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `SELECT
         reference,
         amount_cents,
         currency,
         status,
         mpesa_receipt,
         updated_at
       FROM palpluss_deposits
       WHERE reference = $1
         AND user_id = $2
       LIMIT 1`,
      [reference, userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Palpluss deposit not found." },
        { status: 404 }
      );
    }

    const deposit = result.rows[0];

    return NextResponse.json(
      {
        reference: deposit.reference,
        amount: Number(deposit.amount_cents) / 100,
        currency: deposit.currency,
        status: deposit.status,
        receipt: deposit.mpesa_receipt,
        updatedAt: deposit.updated_at
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    console.error("Palpluss deposit status lookup error:", error);

    return NextResponse.json(
      { error: "Could not check Palpluss deposit status." },
      { status: 500 }
    );
  }
}
