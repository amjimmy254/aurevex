import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const response = await fetch(
      "https://open.er-api.com/v6/latest/KES",
      { next: { revalidate: 3600 } }
    );

    const data = await response.json();
    const usdPerKes = Number(data?.rates?.USD);

    if (
      !response.ok ||
      data?.result !== "success" ||
      !Number.isFinite(usdPerKes) ||
      usdPerKes <= 0
    ) {
      throw new Error("Exchange rate unavailable");
    }

    return NextResponse.json(
      {
        usdPerKes,
        baseCurrency: "KES",
        quoteCurrency: "USD",
        lastUpdated: data.time_last_update_utc ?? null
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600"
        }
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not retrieve the exchange rate." },
      { status: 503 }
    );
  }
}
