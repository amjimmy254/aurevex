import { NextRequest, NextResponse } from "next/server";
import {
  getMarketSeries,
  MARKET_SYMBOLS,
} from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const asset =
    request.nextUrl.searchParams.get("asset") || "EUR/USD";

  if (!MARKET_SYMBOLS[asset]) {
    return NextResponse.json(
      { error: "Unsupported asset." },
      { status: 400 }
    );
  }

  try {
    const market = await getMarketSeries(asset);

    return NextResponse.json(market, {
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Market data unavailable.";

    return NextResponse.json(
      { error: message },
      { status: 503 }
    );
  }
}
