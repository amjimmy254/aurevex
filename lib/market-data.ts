export const MARKET_SYMBOLS: Record<string, string> = {
  "EUR/USD": "EUR/USD",
  "GBP/USD": "GBP/USD",
  "USD/JPY": "USD/JPY",
  "BTC/USD": "BTC/USD",
  "ETH/USD": "ETH/USD",
  "GOLD/USD": "XAU/USD",
};

export async function getMarketSeries(asset: string) {
  const symbol = MARKET_SYMBOLS[asset];
  const key = process.env.TWELVE_DATA_API_KEY;

  if (!symbol || !key) {
    throw new Error("Market data is not configured.");
  }

  const url = new URL(
    "https://api.twelvedata.com/time_series"
  );

  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1min");
  url.searchParams.set("outputsize", "30");
  url.searchParams.set("apikey", key);

  const response = await fetch(url, {
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error("Market provider request failed.");
  }

  const data = await response.json();

  if (data.status === "error" || !Array.isArray(data.values)) {
    throw new Error(
      data.message || "Market data unavailable."
    );
  }

  const values = data.values
    .map((row: { datetime: string; close: string }) => ({
      time: row.datetime,
      price: Number(row.close),
    }))
    .filter(
      (point: { time: string; price: number }) =>
        Number.isFinite(point.price)
    );

  if (!values.length) {
    throw new Error("No market prices returned.");
  }

  return {
    asset,
    providerSymbol: symbol,
    price: values[0].price,
    updatedAt: new Date().toISOString(),
    points: values.reverse(),
  };
}
