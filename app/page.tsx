"use client";

import { useCallback, useEffect, useState } from "react";

type Trade = {
  id: string;
  asset: string;
  direction: "CALL" | "PUT";
  amount: number;
  expiry_seconds: number;
  status: "PENDING" | "WON" | "LOST" | "CANCELLED";
  simulated_result: number;
  created_at: string;
  settled_at: string | null;
};

type MarketPoint = {
  time: string;
  price: number;
};

type Market = {
  asset: string;
  price: number;
  updatedAt: string;
  points: MarketPoint[];
};

const ASSETS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "BTC/USD",
  "ETH/USD",
  "GOLD/USD",
];

const money = (value: number) => `$${value.toFixed(2)}`;

export default function Home() {
  const [balance, setBalance] = useState<number | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [asset, setAsset] = useState("EUR/USD");
  const [amount, setAmount] = useState("10");
  const [duration, setDuration] = useState("60");
  const [market, setMarket] = useState<Market | null>(null);
  const [marketError, setMarketError] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState("");

  const refreshAccount = useCallback(async () => {
    try {
      const [walletResponse, tradesResponse] = await Promise.all([
        fetch("/api/wallet", { cache: "no-store" }),
        fetch("/api/trades", { cache: "no-store" }),
      ]);

      if (!walletResponse.ok || !tradesResponse.ok) {
        throw new Error("Please log in again.");
      }

      const wallet = await walletResponse.json();
      const tradeData = await tradesResponse.json();

      setBalance(Number(wallet.virtualBalance));
      setTrades(tradeData.trades || []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Account loading failed."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMarket = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/market?asset=${encodeURIComponent(asset)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Market data unavailable.");
      }

      setMarket(data);
      setMarketError("");
    } catch (error) {
      setMarketError(
        error instanceof Error ? error.message : "Market unavailable."
      );
    }
  }, [asset]);

  useEffect(() => {
    void refreshAccount();

    const timer = window.setInterval(
      () => void refreshAccount(),
      5000
    );

    return () => window.clearInterval(timer);
  }, [refreshAccount]);

  useEffect(() => {
    setMarket(null);
    void refreshMarket();

    const timer = window.setInterval(
      () => void refreshMarket(),
      30000
    );

    return () => window.clearInterval(timer);
  }, [refreshMarket]);

  async function placeTrade(direction: "CALL" | "PUT") {
    const stake = Number(amount);

    if (!Number.isFinite(stake) || stake < 1 || stake > 500) {
      setMessage("Stake must be between $1 and $500.");
      return;
    }

    setPlacing(true);
    setMessage("Placing practice trade...");

    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset,
          direction,
          amount: stake,
          expirySeconds: Number(duration),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Trade failed.");
      }

      setMessage("Practice trade placed successfully.");
      await refreshAccount();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Trade failed."
      );
    } finally {
      setPlacing(false);
    }
  }

  const pending = trades.filter(
    (trade) => trade.status === "PENDING"
  ).length;

  const prices = market?.points.map((point) => point.price) || [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const chartPoints = prices
    .map((price, index) => {
      const x = (index / Math.max(prices.length - 1, 1)) * 1000;
      const y = 270 - ((price - min) / range) * 230;
      return `${x},${y}`;
    })
    .join(" ");

  const first = prices[0] || 0;
  const last = prices[prices.length - 1] || 0;
  const change = first ? ((last - first) / first) * 100 : 0;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">AUREVEX</div>

        <div className="nav-label">MAIN MENU</div>
        <a className="nav-link active" href="#dashboard">
          ◈ Dashboard
        </a>
        <a className="nav-link" href="#trading">
          ⌁ Demo Trading
        </a>
        <a className="nav-link" href="#history">
          ◷ Trade History
        </a>

        <div className="nav-label">ACCOUNT</div>
        <a className="nav-link" href="/login">
          ♙ Sign in
        </a>

        <div style={{ marginTop: 50 }}>
          <div className="muted">ACCOUNT TYPE</div>
          <p className="gold">DEMO ACCOUNT</p>
        </div>
      </aside>

      <section className="main-content" id="dashboard">
        <header className="topbar">
          <div>
            <div className="eyebrow">TRADING TERMINAL</div>
            <h1 className="page-title">Dashboard</h1>
            <div className="muted">
              Market data and virtual trading
            </div>
          </div>

          <div className="demo-badge">● DEMO MODE</div>
        </header>

        <div className="notice">
          DEMO ONLY — Virtual funds only. Market prices are supplied
          by Twelve Data and may be delayed or unavailable depending
          on your provider plan. Trades are simulated.
        </div>

        <div className="stats-grid">
          <div className="panel">
            <div className="stat-label">VIRTUAL BALANCE</div>
            <div className="stat-value gold">
              {loading
                ? "Loading..."
                : balance === null
                ? "Unavailable"
                : money(balance)}
            </div>
            <div className="muted">Practice funds</div>
          </div>

          <div className="panel">
            <div className="stat-label">OPEN TRADES</div>
            <div className="stat-value">{pending}</div>
            <div className="muted">Awaiting expiry</div>
          </div>

          <div className="panel">
            <div className="stat-label">TOTAL TRADES</div>
            <div className="stat-value">{trades.length}</div>
            <div className="muted">Practice history</div>
          </div>

          <div className="panel">
            <div className="stat-label">MARKET STATUS</div>
            <div className="stat-value">
              {market ? (
                <span className="positive">CONNECTED</span>
              ) : (
                <span className="negative">OFFLINE</span>
              )}
            </div>
            <div className="muted">Market feed</div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="panel">
            <div className="panel-heading">
              <h2>Market Chart</h2>
              <span className="demo-badge">
                {market ? "● LIVE DATA" : "○ CONNECTING"}
              </span>
            </div>

            <label className="field-label" htmlFor="chart-asset">
              Select asset
            </label>

            <select
              id="chart-asset"
              className="asset-select"
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
            >
              {ASSETS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <div style={{ marginTop: 25 }}>
              {market ? (
                <>
                  <div className="stat-label">
                    {market.asset} PRICE
                  </div>

                  <div className="stat-value gold">
                    {market.price.toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                  </div>

                  <div
                    className={
                      change >= 0 ? "positive" : "negative"
                    }
                    style={{ marginTop: 5 }}
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(3)}%
                  </div>

                  <div
                    style={{
                      width: "100%",
                      overflow: "hidden",
                      marginTop: 20,
                    }}
                  >
                    <svg
                      viewBox="0 0 1000 300"
                      width="100%"
                      role="img"
                      aria-label="Market price chart"
                    >
                      <defs>
                        <linearGradient
                          id="chartFill"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#d9ad55"
                            stopOpacity=".25"
                          />
                          <stop
                            offset="100%"
                            stopColor="#d9ad55"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>

                      {[60, 120, 180, 240].map((y) => (
                        <line
                          key={y}
                          x1="0"
                          x2="1000"
                          y1={y}
                          y2={y}
                          stroke="#292c34"
                          strokeWidth="1"
                        />
                      ))}

                      <polygon
                        points={`0,300 ${chartPoints} 1000,300`}
                        fill="url(#chartFill)"
                      />

                      <polyline
                        points={chartPoints}
                        fill="none"
                        stroke="#d9ad55"
                        strokeWidth="4"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <div className="muted">
                    Updated:{" "}
                    {new Date(
                      market.updatedAt
                    ).toLocaleTimeString()}
                  </div>
                </>
              ) : (
                <div className="chart-placeholder">
                  <div className="chart-line">⌁</div>
                  <strong>
                    {marketError || "Loading market prices..."}
                  </strong>
                  <p className="muted">
                    {marketError
                      ? "Check your API configuration and provider access."
                      : "Connecting to Twelve Data"}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => void refreshMarket()}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="panel" id="trading">
            <div className="panel-heading">
              <h2>Practice Trading</h2>
              <span className="demo-badge">SIMULATED</span>
            </div>

            <label className="field-label" htmlFor="trade-asset">
              Asset
            </label>

            <select
              id="trade-asset"
              className="asset-select"
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
            >
              {ASSETS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <label className="field-label" htmlFor="amount">
              Virtual stake ($1–$500)
            </label>

            <input
              id="amount"
              className="trade-input"
              type="number"
              min="1"
              max="500"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <label className="field-label" htmlFor="duration">
              Expiry
            </label>

            <select
              id="duration"
              className="asset-select"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              <option value="10">10 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
            </select>

            <div className="trade-buttons">
              <button
                className="trade-button buy-button"
                disabled={placing || loading || balance === null}
                onClick={() => void placeTrade("CALL")}
              >
                CALL / UP
              </button>

              <button
                className="trade-button sell-button"
                disabled={placing || loading || balance === null}
                onClick={() => void placeTrade("PUT")}
              >
                PUT / DOWN
              </button>
            </div>

            <div className="notice" style={{ marginTop: 18 }}>
              Demo trades are simulated. Live prices are displayed
              separately and are not yet used to determine trade
              results.
            </div>

            <p className="muted">{message}</p>
          </div>
        </div>

        <div className="panel history" id="history">
          <div className="panel-heading">
            <h2>Trade History</h2>
            <button
              className="secondary-button"
              onClick={() => void refreshAccount()}
            >
              Refresh
            </button>
          </div>

          {trades.length === 0 ? (
            <p className="muted">No practice trades yet.</p>
          ) : (
            trades.map((trade) => (
              <div className="history-row" key={trade.id}>
                <div>
                  <strong>
                    {trade.asset} · {trade.direction}
                  </strong>

                  <div className="muted">
                    {new Date(
                      trade.created_at
                    ).toLocaleString()}{" "}
                    · {trade.expiry_seconds}s
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <strong>{money(Number(trade.amount))}</strong>

                  <div
                    className={
                      trade.status === "WON"
                        ? "positive"
                        : trade.status === "LOST"
                        ? "negative"
                        : "gold"
                    }
                  >
                    {trade.status === "PENDING"
                      ? "PENDING"
                      : trade.status === "WON"
                      ? `WON +${money(
                          Number(trade.simulated_result)
                        )}`
                      : trade.status === "LOST"
                      ? `LOST -${money(
                          Number(trade.simulated_result)
                        )}`
                      : trade.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
