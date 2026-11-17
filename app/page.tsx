
"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [balance, setBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [message, setMessage] = useState(
    "Your AUREVEX demo account is ready."
  );

  useEffect(() => {
    async function loadWallet() {
      try {
        const response = await fetch("/api/wallet", {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Wallet could not be loaded.");
        }

        const data = await response.json();

        if (typeof data.virtualBalance !== "number") {
          throw new Error("Invalid wallet balance.");
        }

        setBalance(data.virtualBalance);
        setMessage("Your personal demo wallet is connected.");
      } catch {
        setMessage(
          "Unable to load your wallet. Please log in again."
        );
      } finally {
        setWalletLoading(false);
      }
    }

    loadWallet();
  }, []);

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
          DEMO PLATFORM: All balances are virtual practice funds.
          No real deposits, withdrawals, or financial transactions
          take place.
        </div>

        <div className="stats-grid">
          <div className="panel">
            <div className="stat-label">YOUR VIRTUAL BALANCE</div>

            <div className="stat-value gold">
              {walletLoading
                ? "Loading..."
                : balance === null
                  ? "Unavailable"
                  : `$${balance.toFixed(2)}`}
            </div>

            <div className="muted">
              {walletLoading
                ? "Connecting to your wallet..."
                : balance === null
                  ? "Wallet connection required"
                  : "Personal demo funds from Neon"}
            </div>
          </div>

          <div className="panel">
            <div className="stat-label">OPEN TRADES</div>
            <div className="stat-value">0</div>
            <div className="muted">Trade system not yet connected</div>
          </div>

          <div className="panel">
            <div className="stat-label">ACCOUNT STATUS</div>
            <div className="stat-value positive">ACTIVE</div>
            <div className="muted">Practice account</div>
          </div>

          <div className="panel">
            <div className="stat-label">ACCOUNT TYPE</div>
            <div className="stat-value gold">DEMO</div>
            <div className="muted">Virtual trading only</div>
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
              <h2>AUREVEX MARKETS</h2>
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
              </div>

              <p className="muted">
                Your trade history will appear here when the
                database-backed demo trading system is connected.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h2>Demo Trading</h2>
            </div>

            <div className="notice">
              Demo trading is temporarily unavailable while we
              connect trade records and balance updates securely
              to your personal Neon wallet.
            </div>

            <button
              className="trade-button"
              disabled
              style={{ width: "100%", marginTop: 20 }}
            >
              Trading system coming soon
            </button>

            <div className="notice" style={{ marginTop: 20 }}>
              {message}
            </div>

            <p className="muted" style={{ marginTop: 20 }}>
              Your wallet balance is retrieved from your own
              account. It is virtual practice money and has no
              cash value.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
