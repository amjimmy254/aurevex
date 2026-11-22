import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  // Temporary protection:
  // Do not accept or process payments until Palpluss
  // confirms its webhook signature-verification procedure.
  return NextResponse.json(
    { received: false, error: "Webhook verification is not configured." },
    { status: 503 }
  );
}
