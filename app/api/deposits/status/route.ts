import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: "Legacy Cyzora deposit status is disabled." },
    { status: 503 }
  );
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
         d.reference,
         d.amount_cents,
         d.currency,
         d.status,
         d.mpesa_receipt,
         d.updated_at
       FROM cyzora_deposits d
       WHERE d.reference = $1
         AND d.user_id = $2
       LIMIT 1`,
      [reference, userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Deposit not found." },
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
    console.error("Deposit status lookup error:", error);

    return NextResponse.json(
      { error: "Could not check deposit status." },
      { status: 500 }
    );
  }
}
