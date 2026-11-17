
"use client";

import { useState } from "react";

const assets = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "BTC/USD",
  "ETH/USD",
  "XAU/USD"
];

type Trade = {
  id: number;
  asset: string;
  direction: string;
  amount: number;
  result: string;
};

export default function Home() {
  const [balance, setBalance] = useState(2000);
  const [amount, setAmount] = useState("10");
  const [asset, setAsset] = useState("EUR/USD");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [message, setMessage] = useState(
    "Your demo trading account is ready."
  );

  function placeTrade(direction: "CALL" | "PUT") {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid trade amount.");
      return;
    }

    if (value > balance) {
      setMessage("Insufficient virtual demo balance.");
      return;
    }

    setBalance((current) => current - value);

    const trade: Trade = {
      id: Date.now(),
      asset,
      direction,
      amount: value,
      result: "PENDING"
    };

    setTrades((current) => [trade, ...current]);

    setMessage(
      `${direction} demo order placed for ${asset}. No real money is involved.`
    );
  }

  function resetDemo() {
    setBalance(2000);
    setTrades([]);
    setMessage("Your demo account has been reset.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">AUREVEX</div>

        <div className="nav-label">MAIN MENU</div>
        <div className="nav-link active">◈ Dashboard</div>
        <div className="nav-link">⌁ Trading</div>
        <div className="nav-link">▣ Wallet</div>
        <div className="nav-link">◷ Trade History</div>

        <div className="nav-label">ACCOUNT</div>
        <div className="nav-link">♙ Profile</div>
        <div className="nav-link">⚙ Settings</div>

        <div style={{ marginTop: 50 }}>
          <div className="muted">ACCOUNT TYPE</div>
          <p className="gold">DEMO ACCOUNT</p>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">TRADING TERMINAL</div>
            <h1 className="page-title">Dashboard</h1>
            <div className="muted">
              Welcome to your AUREVEX demo account.
            </div>
          </div>

          <div className="demo-badge">● DEMO MODE</div>
        </header>

        <div className="notice">
          DEMO PLATFORM: All balances and trades are simulated.
          No real deposits, withdrawals, or financial transactions
          take place. The starting $2,000 is virtual demo money.
        </div>

        <div className="stats-grid">
          <div className="panel">
            <div className="stat-label">VIRTUAL BALANCE</div>
            <div className="stat-value gold">
              ${balance.toFixed(2)}
            </div>
            <div className="muted">Demo funds only</div>
          </div>

          <div className="panel">
            <div className="stat-label">OPEN TRADES</div>
            <div className="stat-value">{trades.length}</div>
            <div className="muted">Demo orders placed</div>
          </div>

          <div className="panel">
            <div className="stat-label">ACCOUNT STATUS</div>
            <div className="stat-value positive">ACTIVE</div>
            <div className="muted">Practice account</div>
          </div>

          <div className="panel">
            <div className="stat-label">ACCOUNT TYPE</div>
            <div className="stat-value gold">DEMO</div>
            <div className="muted">Virtual trading</div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="panel">
            <div className="panel-heading">
              <h2>Market Overview</h2>
              <span className="demo-badge">SIMULATED</span>
            </div>

            <div className="chart-placeholder">
              <div className="chart-line">⌁</div>
              <h2>{asset}</h2>
              <p className="muted">
                Illustrative chart area
              </p>
              <p className="muted">
                Live market data is not connected.
              </p>
            </div>

            <div className="history">
              <div className="panel-heading">
                <h2>Recent Demo Trades</h2>
                <span className="muted">{trades.length} orders</span>
              </div>

              {trades.length === 0 ? (
                <p className="muted">
                  Your demo trades will appear here.
                </p>
              ) : (
                trades.map((trade) => (
                  <div className="history-row" key={trade.id}>
                    <div>
                      <strong>{trade.asset}</strong>
                      <div className="muted">
                        {trade.direction}
                      </div>
                    </div>
                    <div>
                      ${trade.amount.toFixed(2)}
                    </div>
                    <div className="gold">{trade.result}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h2>Place Demo Trade</h2>
            </div>

            <label className="field-label">SELECT ASSET</label>
            <select
              className="asset-select"
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
            >
              {assets.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <label className="field-label">
              TRADE AMOUNT (VIRTUAL USD)
            </label>
            <input
              className="trade-input"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />

            <div className="trade-buttons">
              <button
                className="trade-button buy-button"
                onClick={() => placeTrade("CALL")}
              >
                ↑ CALL
              </button>

              <button
                className="trade-button sell-button"
                onClick={() => placeTrade("PUT")}
              >
                ↓ PUT
              </button>
            </div>

            <div className="notice" style={{ marginTop: 20 }}>
              {message}
            </div>

            <button
              className="secondary-button"
              style={{ width: "100%" }}
              onClick={resetDemo}
            >
              Reset Demo Account
            </button>

            <p className="muted" style={{ marginTop: 20 }}>
              Orders are practice simulations, not executed
              financial trades. No profit or loss is calculated.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
