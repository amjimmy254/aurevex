import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  return NextResponse.json(
    { error: "Withdrawal fee previews are disabled." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
