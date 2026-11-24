import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "Legacy deposit status is disabled." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
