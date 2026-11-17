
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

const money = (value: number) => `$${value.toFixed(2)}`;

export default function Home() {
  const [balance, setBalance] = useState<number | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [asset, setAsset] = useState("EUR/USD");
  const [amount, setAmount] = useState("10");
  const [duration, setDuration] = useState("30");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState("Loading your demo account…");

  const refresh = useCallback(async () => {
    try {
      const [walletResponse, tradesResponse] = await Promise.all([
        fetch("/api/wallet", { cache: "no-store" }),
        fetch("/api/trades", { cache: "no-store" })
      ]);

      if (!walletResponse.ok || !tradesResponse.ok) {
        throw new Error("Please log in again.");
      }

      const wallet = await walletResponse.json();
      const tradeData = await tradesResponse.json();

      setBalance(Number(wallet.virtualBalance));
      setTrades(Array.isArray(tradeData.trades) ? tradeData.trades : []);
      setMessage("Your personal demo wallet is connected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load account.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function placeTrade(direction: "CALL" | "PUT") {
    const stake = Number(amount);

    if (!Number.isFinite(stake) || stake < 1 || stake > 500) {
      setMessage("Choose a stake between $1 and $500.");
      return;
    }

    setPlacing(true);
    setMessage("Placing simulated practice trade…");

    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset,
          direction,
          amount: stake,
          expirySeconds: Number(duration)
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Trade failed.");

      setMessage("Practice trade placed. Waiting for simulated expiry.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trade failed.");
    } finally {
      setPlacing(false);
    }
  }

  const pending = trades.filter(t => t.status === "PENDING").length;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">AUREVEX</div>
        <div className="nav-label">MAIN MENU</div>
        <a className="nav-link active" href="#dashboard">◈ Dashboard</a>
        <a className="nav-link" href="#trading">⌁ Demo Trading</a>
        <a className="nav-link" href="#history">◷ Trade History</a>
        <div className="nav-label">ACCOUNT</div>
        <a className="nav-link" href="/login">♙ Sign in</a>
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
            <div className="muted">Your virtual practice account</div>
          </div>
          <div className="demo-badge">● DEMO MODE</div>
        </header>

        <div className="notice">
          DEMO ONLY — no real money, deposits, withdrawals or live market prices.
          Outcomes use an independent 50/50 simulated draw. A win returns the
          virtual stake plus an 80% simulated return. A loss loses the virtual stake.
          This is not a prediction service.
        </div>

        <div className="stats-grid">
          <div className="panel">
            <div className="stat-label">VIRTUAL BALANCE</div>
            <div className="stat-value gold">
              {loading ? "Loading…" : balance === null ? "Unavailable" : money(balance)}
            </div>
            <div className="muted">Your personal demo wallet</div>
          </div>
          <div className="panel">
            <div className="stat-label">OPEN TRADES</div>
            <div className="stat-value">{pending}</div>
            <div className="muted">Waiting for expiry</div>
          </div>
          <div className="panel">
            <div className="stat-label">TOTAL PRACTICE TRADES</div>
            <div className="stat-value">{trades.length}</div>
            <div className="muted">Saved to your account</div>
          </div>
          <div className="panel">
            <div className="stat-label">ACCOUNT STATUS</div>
            <div className="stat-value positive">ACTIVE</div>
            <div className="muted">Virtual funds only</div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="panel" id="trading">
            <div className="panel-heading">
              <h2>Demo Trading</h2>
              <span className="demo-badge">SIMULATED</span>
            </div>

            <label className="field-label" htmlFor="asset">Practice asset</label>
            <select id="asset" className="asset-select" value={asset}
              onChange={e => setAsset(e.target.value)}>
              <option>EUR/USD</option>
              <option>GBP/USD</option>
              <option>USD/JPY</option>
              <option>BTC/USD</option>
              <option>GOLD/USD</option>
            </select>

            <label className="field-label" htmlFor="amount">Virtual stake ($1–$500)</label>
            <input id="amount" className="trade-input" type="number"
              min="1" max="500" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} />

            <label className="field-label" htmlFor="duration">Practice duration</label>
            <select id="duration" className="asset-select" value={duration}
              onChange={e => setDuration(e.target.value)}>
              <option value="10">10 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
            </select>

            <div className="trade-buttons">
              <button className="trade-button buy-button"
                disabled={placing || loading || balance === null}
                onClick={() => void placeTrade("CALL")}>
                CALL / UP
              </button>
              <button className="trade-button sell-button"
                disabled={placing || loading || balance === null}
                onClick={() => void placeTrade("PUT")}>
                PUT / DOWN
              </button>
            </div>

            <p className="muted" style={{ marginTop: 15 }}>
              These are practice labels only. No real asset is bought or sold.
            </p>
            <div className="notice" style={{ marginTop: 18 }}>{message}</div>
          </div>

          <div className="panel">
            <div className="panel-heading"><h2>Practice rules</h2></div>
            <p className="muted">• New accounts start with $2,000 virtual funds.</p>
            <p className="muted">• Your virtual stake is reserved when a trade is placed.</p>
            <p className="muted">• Outcomes are independent of your identity and stake.</p>
            <p className="muted">• Expired trades settle when your history refreshes.</p>
            <p className="muted">• This is a learning simulator, not an investment product.</p>
          </div>
        </div>

        <div className="panel history" id="history">
          <div className="panel-heading">
            <h2>Trade History</h2>
            <button className="secondary-button" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>

          {trades.length === 0 ? (
            <p className="muted">No practice trades yet.</p>
          ) : trades.map(trade => (
            <div className="history-row" key={trade.id}>
              <div>
                <strong>{trade.asset} · {trade.direction}</strong>
                <div className="muted">
                  {new Date(trade.created_at).toLocaleString()} · {trade.expiry_seconds}s
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>{money(Number(trade.amount))}</strong>
                <div className={
                  trade.status === "WON" ? "positive" :
                  trade.status === "LOST" ? "negative" : "gold"
                }>
                  {trade.status === "PENDING" ? "PENDING" :
                    trade.status === "WON" ?
                      `WON +${money(Number(trade.simulated_result))}` :
                    trade.status === "LOST" ?
                      `LOST ${money(Number(trade.simulated_result))}` :
                      trade.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
