/**
 * Simulated market data feed.
 *
 * price(asset, t) is a pure function of the timestamp, so the entry price
 * recorded when a trade opens and the live quote served later always come
 * from the same series. Prices are quantised to a tick and cached per tick
 * bucket, so the tape steps like a real feed instead of gliding.
 */

export type SimulatedQuote = {
  asset: string;
  mid: number;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  tickSize: number;
  ts: number;
  source: "SIMULATED_FEED";
};

type Spec = {
  base: number;
  digits: number;
  tick: number;
  spreadTicks: number;
  /** one-minute sigma, as a fraction of price */
  volPerMinute: number;
};

const DEFAULT_SPEC: Spec = {
  base: 100,
  digits: 2,
  tick: 0.01,
  spreadTicks: 20,
  volPerMinute: 0.00092,
};

const SPECS: Record<string, Spec> = {
  "EUR/USD": { base: 1.0842, digits: 5, tick: 0.00001, spreadTicks: 8, volPerMinute: 0.000185 },
  "GBP/USD": { base: 1.2718, digits: 5, tick: 0.00001, spreadTicks: 12, volPerMinute: 0.00023 },
  "USD/JPY": { base: 157.42, digits: 3, tick: 0.001, spreadTicks: 10, volPerMinute: 0.000185 },
  "AUD/USD": { base: 0.6591, digits: 5, tick: 0.00001, spreadTicks: 10, volPerMinute: 0.000215 },
  "USD/CHF": { base: 0.8934, digits: 5, tick: 0.00001, spreadTicks: 12, volPerMinute: 0.00017 },
  "USD/CAD": { base: 1.3692, digits: 5, tick: 0.00001, spreadTicks: 14, volPerMinute: 0.00017 },
  "XAU/USD": { base: 2418.4, digits: 2, tick: 0.01, spreadTicks: 25, volPerMinute: 0.00054 },
  "BTC/USD": { base: 67420, digits: 2, tick: 0.5, spreadTicks: 40, volPerMinute: 0.00092 },
  "ETH/USD": { base: 3480.2, digits: 2, tick: 0.05, spreadTicks: 30, volPerMinute: 0.0011 },
  NAS100: { base: 19840.5, digits: 1, tick: 0.1, spreadTicks: 20, volPerMinute: 0.00062 },
  SPX500: { base: 5462.3, digits: 1, tick: 0.1, spreadTicks: 12, volPerMinute: 0.00046 },
};

const TICK_MS = 250;
const CACHE_LIMIT = 4000;
const quoteCache = new Map<string, SimulatedQuote>();

/** [periodMs, weight] — Brownian-style ladder, sqrt(period) does the scaling */
const OCTAVES: Array<[number, number]> = [
  [86_400_000, 1.5],
  [14_400_000, 1.4],
  [3_600_000, 1.3],
  [900_000, 1.2],
  [240_000, 1.1],
  [60_000, 1.0],
  [15_000, 0.95],
  [3_000, 0.9],
];

function hash01(key: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function noiseAt(key: string, t: number, period: number) {
  const x = t / period;
  const i = Math.floor(x);
  const f = smooth(x - i);
  const a = hash01(`${key}|${period}|${i}`);
  const b = hash01(`${key}|${period}|${i + 1}`);
  return a + (b - a) * f;
}

function normalizeAsset(asset: string) {
  const raw = String(asset || "").trim().toUpperCase().replace(/\s+/g, "");
  if (SPECS[raw]) return raw;
  if (/^[A-Z]{6}$/.test(raw)) {
    const slashed = `${raw.slice(0, 3)}/${raw.slice(3)}`;
    if (SPECS[slashed]) return slashed;
  }
  return raw;
}

function sessionFactor(asset: string, ts: number) {
  const date = new Date(ts);
  const hour = date.getUTCHours();
  const day = date.getUTCDay();
  const isCrypto = asset === "BTC/USD" || asset === "ETH/USD";

  if (!isCrypto && (day === 0 || day === 6)) return 0.35;
  if (hour >= 12 && hour < 16) return 1.4; // London/NY overlap
  if (hour >= 7 && hour < 12) return 1.15;
  if (hour >= 16 && hour < 21) return 1.0;
  if (hour >= 21) return 0.7;
  return 0.55;
}

function roundToTick(value: number, tick: number, digits: number) {
  return Number((Math.round(value / tick) * tick).toFixed(digits));
}

export function getVolatilityPerMinute(asset: string, at = Date.now()) {
  const key = normalizeAsset(asset);
  const spec = SPECS[key] ?? DEFAULT_SPEC;
  return spec.volPerMinute * sessionFactor(key, at);
}

export function getSimulatedQuote(
  asset: string,
  at = Date.now()
): SimulatedQuote {
  const key = normalizeAsset(asset);
  const spec = SPECS[key] ?? DEFAULT_SPEC;
  const ts = Number.isFinite(at) ? at : Date.now();
  const bucket = Math.floor(ts / TICK_MS);
  const cacheKey = `${key}:${bucket}`;

  const cached = quoteCache.get(cacheKey);
  if (cached) return cached;

  const vol = spec.volPerMinute * sessionFactor(key, ts);
  let logMove = 0;

  for (const [period, weight] of OCTAVES) {
    logMove +=
      (noiseAt(key, ts, period) - 0.5) * 2 * weight * vol * Math.sqrt(period / 60_000);
  }

  // occasional micro-spike so the tape isn't clean Gaussian noise
  const spike = hash01(`spike|${key}|${Math.floor(ts / 4_000)}`);
  if (spike > 0.965) logMove += (spike - 0.965) * 24 * vol;

  const mid = roundToTick(spec.base * Math.exp(logMove), spec.tick, spec.digits);
  const half = (spec.spreadTicks * spec.tick) / 2;
  const bid = roundToTick(Math.max(spec.tick, mid - half), spec.tick, spec.digits);
  const ask = roundToTick(mid + half, spec.tick, spec.digits);

  const quote: SimulatedQuote = {
    asset: key,
    mid,
    bid,
    ask,
    spread: Number((ask - bid).toFixed(spec.digits)),
    digits: spec.digits,
    tickSize: spec.tick,
    ts,
    source: "SIMULATED_FEED",
  };

  if (quoteCache.size > CACHE_LIMIT) quoteCache.clear();
  quoteCache.set(cacheKey, quote);

  return quote;
}
/**
 * Supported simulated market symbols.
 * These are internal symbols, not live-market provider symbols.
 */
export const MARKET_SYMBOLS: Record<string, string> = {
  ...Object.fromEntries(
    Object.keys(SPECS).map((asset) => [asset, asset])
  ),

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

/**
 * Returns a simulated market snapshot.
 * The price is generated by the existing deterministic simulated feed.
 */
export async function getMarketSeries(
  asset: string,
  timeframe = "1m"
) {
  const symbol = String(asset || "").trim();

  if (!MARKET_SYMBOLS[symbol]) {
    throw new Error("Unsupported simulated market.");
  }

  const quote = getSimulatedQuote(symbol);

  return {
    asset: symbol,
    symbol,
    providerSymbol: MARKET_SYMBOLS[symbol],
    price: quote.mid,
    bid: quote.bid,
    ask: quote.ask,
    spread: quote.spread,
    digits: quote.digits,
    tickSize: quote.tickSize,
    timestamp: quote.ts,
    timeframe,
    source: "SIMULATED_FEED" as const,
  };
}

/** Kept for existing entry-price call sites. */
export function getSimulatedPrice(asset: string, at = Date.now()) {
  return getSimulatedQuote(asset, at).mid;
}
