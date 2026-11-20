
export const MARKET_SYMBOLS: Record<string, string> = {
  "EUR/USD": "EUR/USD",
  "GBP/USD": "GBP/USD",
  "USD/JPY": "USD/JPY",
  "BTC/USD": "BTC/USD",
  "ETH/USD": "ETH/USD",
  "GOLD/USD": "GOLD/USD",

  "Volatility 10 Index": "Volatility 10 Index",
  "Volatility 15 (1s) Index": "Volatility 15 (1s) Index",
  "Volatility 25 (1s) Index": "Volatility 25 (1s) Index",
  "Volatility 25 Index": "Volatility 25 Index",
  "Volatility 30 (1s) Index": "Volatility 30 (1s) Index",
  "Volatility 50 (1s) Index": "Volatility 50 (1s) Index",
  "Volatility 50 Index": "Volatility 50 Index",
  "Volatility 75 (1s) Index": "Volatility 75 (1s) Index",
  "Volatility 75 Index": "Volatility 75 Index",
  "Volatility 90 (1s) Index": "Volatility 90 (1s) Index",
};

const ASSET_CONFIG: Record<
  string,
  { base: number; volatility: number; decimals: number; seed: number }
> = {
  "EUR/USD": { base: 1.085, volatility: 0.0018, decimals: 5, seed: 11 },
  "GBP/USD": { base: 1.270, volatility: 0.0022, decimals: 5, seed: 23 },
  "USD/JPY": { base: 150, volatility: 0.28, decimals: 3, seed: 37 },
  "BTC/USD": { base: 68000, volatility: 420, decimals: 2, seed: 41 },
  "ETH/USD": { base: 3500, volatility: 32, decimals: 2, seed: 53 },
  "GOLD/USD": { base: 2350, volatility: 8, decimals: 2, seed: 67 },

  "Volatility 10 Index": { base: 1000, volatility: 2, decimals: 2, seed: 71 },
  "Volatility 15 (1s) Index": { base: 1000, volatility: 3, decimals: 2, seed: 73 },
  "Volatility 25 (1s) Index": { base: 1000, volatility: 5, decimals: 2, seed: 79 },
  "Volatility 25 Index": { base: 1000, volatility: 4, decimals: 2, seed: 83 },
  "Volatility 30 (1s) Index": { base: 1000, volatility: 6, decimals: 2, seed: 89 },
  "Volatility 50 (1s) Index": { base: 1000, volatility: 8, decimals: 2, seed: 97 },
  "Volatility 50 Index": { base: 1000, volatility: 7, decimals: 2, seed: 101 },
  "Volatility 75 (1s) Index": { base: 1000, volatility: 12, decimals: 2, seed: 103 },
  "Volatility 75 Index": { base: 1000, volatility: 10, decimals: 2, seed: 107 },
  "Volatility 90 (1s) Index": { base: 1000, volatility: 15, decimals: 2, seed: 109 },
};

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

export function getSimulatedPrice(
  asset: string,
  timestamp = Date.now()
) {
  const config = ASSET_CONFIG[asset];

  if (!config) {
    throw new Error("Unsupported demo asset.");
  }

  const bucket = Math.floor(timestamp / 1000);
  const seconds = bucket;

  const wave =
    Math.sin(seconds / 19 + config.seed) * 0.48 +
    Math.sin(seconds / 47 + config.seed * 2) * 0.31 +
    Math.sin(seconds / 113 + config.seed * 3) * 0.21;

  const noise =
    Math.sin(bucket * 12.9898 + config.seed * 78.233) * 0.08;

  const raw =
    config.base + config.volatility * (wave + noise);

  return Number(raw.toFixed(config.decimals));
}

export async function getMarketSeries(
  asset: string,
  timeframe = "1m"
) {
  const stepSeconds = TIMEFRAME_SECONDS[timeframe];

  if (!ASSET_CONFIG[asset]) {
    throw new Error("Unsupported demo asset.");
  }

  if (!stepSeconds) {
    throw new Error("Unsupported chart timeframe.");
  }

  const now = Date.now();

  const points = Array.from({ length: 30 }, (_, index) => {
    const timestamp =
      now - (29 - index) * stepSeconds * 1000;

    return {
      time: new Date(timestamp).toISOString(),
      price: getSimulatedPrice(asset, timestamp),
    };
  });

  return {
    asset,
    timeframe,
    providerSymbol: asset,
    price: getSimulatedPrice(asset, now),
    updatedAt: new Date(now).toISOString(),
    points,
    simulated: true,
  };
}
