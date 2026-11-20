"use client";

import { useEffect, useState } from "react";

type SimulationResults = {
  accountEmail: string;
  label: string;
  notice: string;
  simulatedWinRate: number;
  simulatedLossRate: number;
  iterationsPerContract: number;
  results: Record<
    string,
    {
      total: number;
      wins: number;
      losses: number;
      winPercentage: number;
      lossPercentage: number;
    }
  >;
};

type HistoryEntry = SimulationResults & {
  ranAt: string;
};
const CONTRACTS = [
  "DIRECTIONAL",
  "EVEN_ODD",
  "OVER_UNDER",
  "MATCHES_DIFFERS",
];

export default function QASimulatorPage() {
  const [iterations, setIterations] = useState("1000");
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [accountEmail, setAccountEmail] = useState("");
  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await fetch("/api/qa-simulator", {
          credentials: "same-origin",
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.accountEmail) return;

        const email = String(data.accountEmail).toLowerCase();
        setAccountEmail(email);

        const saved = localStorage.getItem(
          `aurevex-qa-history:${email}`
        );

        if (saved) {
          const parsed = JSON.parse(saved);

          if (Array.isArray(parsed)) {
            setHistory(parsed);
          }
        }
      } catch {
        setHistory([]);
      }
    }

    loadHistory();
  }, []);

  async function runSimulation() {
    setLoading(true);
    setError("");
    setResults(null);

    try {
      const response = await fetch("/api/qa-simulator", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          iterations: Number(iterations),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Simulation failed.");
      }

      const entry: HistoryEntry = {
  ...data,
  ranAt: new Date().toISOString(),
};

const key = `aurevex-qa-history:${String(data.accountEmail).toLowerCase()}`;
const saved = localStorage.getItem(key);
const previous: HistoryEntry[] = saved ? JSON.parse(saved) : [];
const updated = [entry, ...previous].slice(0, 20);

localStorage.setItem(key, JSON.stringify(updated));
setHistory(updated);
setAccountEmail(String(data.accountEmail).toLowerCase());
setResults(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to run simulation."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <a href="/" style={styles.back}>
          ← Back to AUREVEX
        </a>

        <header style={styles.header}>
          <div style={styles.logo}>A</div>
          <div>
            <h1 style={styles.title}>AUREVEX QA SIMULATOR</h1>
            <p style={styles.subtitle}>
              Controlled probability testing environment
            </p>
          </div>
        </header>

        <section style={styles.notice}>
          <strong>TEST ENVIRONMENT ONLY</strong>
          <p>
            All results are randomly generated statistical test
            outcomes. No trades, balances, deposits, withdrawals
            or real-money transactions are changed.
          </p>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Simulation controls</h2>

          <label style={styles.label}>
            Number of iterations per contract
          </label>

          <select
            value={iterations}
            onChange={(event) => setIterations(event.target.value)}
            style={styles.select}
          >
            <option value="100">100 iterations</option>
            <option value="500">500 iterations</option>
            <option value="1000">1,000 iterations</option>
            <option value="5000">5,000 iterations</option>
            <option value="10000">10,000 iterations</option>
          </select>

          <button
            onClick={runSimulation}
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "RUNNING TEST..." : "RUN QA SIMULATION"}
          </button>

          {error && <p style={styles.error}>{error}</p>}
        </section>

        {results && (
          <>
            <section style={styles.panel}>
              <h2 style={styles.heading}>Test configuration</h2>

              <div style={styles.statRow}>
                <span>Simulated win probability</span>
                <strong>{results.simulatedWinRate}%</strong>
              </div>

              <div style={styles.statRow}>
                <span>Simulated loss probability</span>
                <strong>{results.simulatedLossRate}%</strong>
              </div>

              <div style={styles.statRow}>
                <span>Iterations per contract</span>
                <strong>{results.iterationsPerContract}</strong>
              </div>

              <p style={styles.smallNotice}>{results.notice}</p>
            </section>

            <h2 style={styles.heading}>Contract test results</h2>

            {CONTRACTS.map((contract) => {
              const item = results.results[contract];

              if (!item) return null;

              return (
                <section key={contract} style={styles.resultCard}>
                  <h3 style={styles.contract}>{contract.replaceAll("_", " ")}</h3>

                  <div style={styles.statRow}>
                    <span>Total tests</span>
                    <strong>{item.total}</strong>
                  </div>

                  <div style={styles.statRow}>
                    <span>Simulated wins</span>
                    <strong style={styles.win}>{item.wins}</strong>
                  </div>

                  <div style={styles.statRow}>
                    <span>Simulated losses</span>
                    <strong style={styles.loss}>{item.losses}</strong>
                  </div>

                  <div style={styles.bar}>
                    <div
                      style={{
                        ...styles.winBar,
                        width: `${item.winPercentage}%`,
                      }}
                    />
                    <div
                      style={{
                        ...styles.lossBar,
                        width: `${item.lossPercentage}%`,
                      }}
                    />
                  </div>

                  <div style={styles.statRow}>
                    <span>Win percentage</span>
                    <strong>{item.winPercentage}%</strong>
                  </div>

                  <div style={styles.statRow}>
                    <span>Loss percentage</span>
                    <strong>{item.lossPercentage}%</strong>
                  </div>
                </section>
              );
            })}
          </>
        )}

        <section style={styles.panel}>
          <h2 style={styles.heading}>Previous test runs</h2>

          <p style={styles.smallNotice}>
            Saved on this browser for {accountEmail || "your signed-in account"}.
            Latest 20 runs are kept per account.
          </p>

          {history.length === 0 ? (
            <p style={styles.smallNotice}>No saved test runs yet.</p>
          ) : (
            history.map((entry, index) => (
              <div key={`${entry.ranAt}-${index}`} style={styles.statRow}>
                <span>
                  {new Date(entry.ranAt).toLocaleString()} ·{" "}
                  {entry.iterationsPerContract} per contract
                </span>
                <strong>
                  {entry.simulatedWinRate}% / {entry.simulatedLossRate}%
                </strong>
              </div>
            ))
          )}
        </section>
        <footer style={styles.footer}>
          AUREVEX · QA TESTING · VIRTUAL RESULTS ONLY
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#080d18",
    color: "#eef2ff",
    padding: "25px 16px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "750px",
    margin: "0 auto",
  },
  back: {
    color: "#93c5fd",
    textDecoration: "none",
    fontSize: "13px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    margin: "30px 0",
  },
  logo: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    background: "#2563eb",
    display: "grid",
    placeItems: "center",
    fontSize: "26px",
    fontWeight: "bold",
  },
  title: {
    fontSize: "20px",
    margin: 0,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "12px",
  },
  notice: {
    background: "#172554",
    border: "1px solid #1e40af",
    padding: "17px",
    borderRadius: "12px",
    color: "#bfdbfe",
    fontSize: "13px",
    marginBottom: "20px",
    lineHeight: 1.6,
  },
  panel: {
    background: "#111827",
    border: "1px solid #263449",
    padding: "20px",
    borderRadius: "14px",
    marginBottom: "20px",
  },
  heading: {
    fontSize: "17px",
    marginBottom: "18px",
  },
  label: {
    display: "block",
    color: "#94a3b8",
    fontSize: "13px",
    marginBottom: "9px",
  },
  select: {
    width: "100%",
    padding: "13px",
    background: "#080d18",
    color: "white",
    border: "1px solid #334155",
    borderRadius: "8px",
    marginBottom: "15px",
  },
  button: {
    width: "100%",
    padding: "15px",
    border: 0,
    borderRadius: "8px",
    background: "#2563eb",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
  error: {
    color: "#fca5a5",
    fontSize: "13px",
    marginTop: "15px",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 0",
    borderBottom: "1px solid #263449",
    fontSize: "13px",
    color: "#cbd5e1",
  },
  smallNotice: {
    color: "#94a3b8",
    fontSize: "12px",
    lineHeight: 1.6,
    marginTop: "15px",
  },
  resultCard: {
    background: "#111827",
    border: "1px solid #263449",
    borderRadius: "12px",
    padding: "18px",
    marginBottom: "15px",
  },
  contract: {
    fontSize: "14px",
    color: "#93c5fd",
    marginTop: 0,
  },
  win: {
    color: "#4ade80",
  },
  loss: {
    color: "#f87171",
  },
  bar: {
    display: "flex",
    height: "10px",
    width: "100%",
    overflow: "hidden",
    borderRadius: "10px",
    background: "#334155",
    margin: "15px 0",
  },
  winBar: {
    background: "#16a34a",
    height: "100%",
  },
  lossBar: {
    background: "#dc2626",
    height: "100%",
  },
  footer: {
    textAlign: "center",
    color: "#64748b",
    fontSize: "11px",
    marginTop: "35px",
  },
};
