import { NextResponse } from "next/server";
import { getHourlyEvent } from "@/lib/hourly-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const event = getHourlyEvent();

    return NextResponse.json(
      {
        success: true,
        event
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    console.error("Hourly event API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Hourly event is not configured."
      },
      { status: 503 }
    );
  }
}
