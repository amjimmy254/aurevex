import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "PalPluss retry is temporarily disabled pending reconciliation."
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
