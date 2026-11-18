"use client";

import { useEffect, useState } from "react";

const ASSETS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "BTC/USD",
  "ETH/USD",
  "GOLD/USD",
];

const CONTRACTS = [
  { id: "DIRECTIONAL", name: "UP / DOWN" },
  { id: "EVEN_ODD", name: "EVEN / ODD" },
  { id: "OVER_UNDER", name: "OVER / UNDER" },
  { id: "MATCHES_DIFFERS", name: "MATCHES / DIFFERS" },
];

export default function Home() {
  const [asset, setAsset] = useState("EUR/USD");
  const [contract, setContract] = useState("DIRECTIONAL");
  const [prediction, setPrediction] = useState("CALL");
  const [amount, setAmount] = useState("10");
  const [expiry, setExpiry] = useState("60");
  const [targetPrice, setTargetPrice] = useState("");
  const [selectedDigit, setSelectedDigit] = useState("5");

  const [price, setPrice] = useState<number | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);
  const [chartPoints, setChartPoints] = useState<number[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [marketError, setMarketError] = useState("");
  const [marketLoading, setMarketLoading] = useState(true);

  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadMarket() {
    try {
      const response = await fetch(
        `/api/market?asset=${encodeURIComponent(asset)}&t=${Date.now()}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Market unavailable");
      }

      const currentPrice = Number(data.price);

      if (!Number.isFinite(currentPrice)) {
        throw new Error("Invalid market price");
      }

      setPrice((oldPrice) => {
        if (oldPrice !== null && oldPrice !== currentPrice) {
          setPreviousPrice(oldPrice);
        }
        return currentPrice;
      });

      if (Array.isArray(data.points)) {
        const values = data.points
          .map((point: any) => {
            if (typeof point === "number") return point;

            return Number(
              point.close ??
                point.price ??
                point.value ??
                point.open
            );
          })
          .filter((value: number) => Number.isFinite(value));

        setChartPoints(values);
      }

      setLastUpdated(new Date().toLocaleTimeString());
      setMarketError("");
      setMarketLoading(false);
    } catch (error: any) {
      setMarketError(error.message || "Market unavailable");
      setMarketLoading(false);
    }
  }

  async function loadTrades() {
    try {
      const response = await fetch("/api/trades", {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.ok) {
        setTrades(data.trades || []);
      }
    } catch {
      console.log("Could not load trade history");
    }
  }

  useEffect(() => {
    setPrice(null);
    setPreviousPrice(null);
    setChartPoints([]);
    setMarketLoading(true);

    loadMarket();
    loadTrades();

    const interval = setInterval(() => {
      loadMarket();
      loadTrades();
    }, 10000);

    return () => clearInterval(interval);
  }, [asset]);

  useEffect(() => {
    setPrediction(
      contract === "DIRECTIONAL"
        ? "CALL"
        : contract === "EVEN_ODD"
          ? "EVEN"
          : contract === "OVER_UNDER"
            ? "OVER"
            : "MATCHES"
    );
  }, [contract]);

  async function placeTrade() {
    setMessage("");

    if (price === null) {
      setMessage("Market price is unavailable.");
      return;
    }

    const stake = Number(amount);

    if (!Number.isFinite(stake) || stake < 1 || stake > 500) {
      setMessage("Stake must be between $1 and $500.");
      return;
    }

    if (
      contract === "OVER_UNDER" &&
      (!targetPrice || Number(targetPrice) <= 0)
    ) {
      setMessage("Enter a valid target price.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset,
          contractType: contract,
          prediction,
          amount: stake,
          expirySeconds: Number(expiry),
          targetPrice:
            contract === "OVER_UNDER"
              ? Number(targetPrice)
              : null,
          selectedDigit:
            contract === "MATCHES_DIFFERS"
              ? Number(selectedDigit)
              : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Trade failed");
      }

      setMessage("Demo contract placed successfully!");
      await loadTrades();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  const pending = trades.filter(
    (trade) => trade.status === "PENDING"
  );

  const settled = trades.filter(
    (trade) => trade.status !== "PENDING"
  );

  const priceDigits =
    asset === "USD/JPY"
      ? 3
      : ["EUR/USD", "GBP/USD"].includes(asset)
        ? 5
        : 2;

  const chartMin =
    chartPoints.length > 0
      ? Math.min(...chartPoints)
      : 0;

  const chartMax =
    chartPoints.length > 0
      ? Math.max(...chartPoints)
      : 0;

  const chartRange = chartMax - chartMin || 1;

  const priceUp =
    previousPrice !== null &&
    price !== null &&
    price >= previousPrice;

  const priceColor =
    previousPrice === null
      ? "#00dfa2"
      : priceUp
        ? "#00dfa2"
        : "#ff526d";

  const chartColor =
    chartPoints.length > 1 &&
    chartPoints[chartPoints.length - 1] >= chartPoints[0]
      ? "#00dfa2"
      : "#ff526d";

  return (
    <main className="aurevex">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">A</span>
          AUREVEX
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="demo-label">DEMO ACCOUNT</span>

          <button
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            style={{
              background: "#ff526d",
              color: "#ffffff",
              border: "none",
              padding: "9px 14px",
              borderRadius: "7px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            LOG OUT
          </button>
        </div>
      </header>

      <div className="dashboard">

        {/* MARKET CHART */}

        <section className="market-card">
          <div className="market-top">
            <div>
              <p className="muted">SELECT MARKET</p>

              <select
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
              >
                {ASSETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="price-box">
              <p className="muted">MARKET PRICE</p>

              <h2 style={{ color: priceColor }}>
                {price !== null
                  ? price.toFixed(priceDigits)
                  : "Loading..."}
              </h2>

              {price !== null && previousPrice !== null && (
                <span
                  className="price-change"
                  style={{ color: priceColor }}
                >
                  {priceUp ? "▲" : "▼"}{" "}
                  {Math.abs(price - previousPrice).toFixed(
                    priceDigits
                  )}
                </span>
              )}

              <span className="live-indicator">
                <span className="live-dot"></span>
                MARKET DATA
              </span>
            </div>
          </div>

          {marketError && (
            <p className="error">{marketError}</p>
          )}

          <div className="chart-heading">
            <div>
              <strong>{asset}</strong>
              <span>Market chart</span>
            </div>

            <div className="timeframes">
              <button className="time-active">1M</button>
              <button>5M</button>
              <button>15M</button>
              <button>1H</button>
            </div>
          </div>

          <div className="market-chart">
            {chartPoints.length > 1 ? (
              <svg
                viewBox="0 0 600 240"
                preserveAspectRatio="none"
                className="chart-svg"
              >
                <defs>
                  <linearGradient
                    id="chartGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={chartColor}
                      stopOpacity="0.25"
                    />

                    <stop
                      offset="100%"
                      stopColor={chartColor}
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>

                {[40, 80, 120, 160, 200].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="600"
                    y2={y}
                    stroke="#1a2636"
                    strokeWidth="1"
                  />
                ))}

                <polygon
                  fill="url(#chartGradient)"
                  points={`0,240 ${chartPoints
                    .map((point, index) => {
                      const x =
                        (index / (chartPoints.length - 1)) *
                        600;

                      const y =
                        220 -
                        ((point - chartMin) / chartRange) *
                          190;

                      return `${x},${y}`;
                    })
                    .join(" ")} 600,240`}
                />

                <polyline
                  fill="none"
                  stroke={chartColor}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={chartPoints
                    .map((point, index) => {
                      const x =
                        (index / (chartPoints.length - 1)) *
                        600;

                      const y =
                        220 -
                        ((point - chartMin) / chartRange) *
                          190;

                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
              </svg>
            ) : (
              <div className="chart-placeholder">
                <span>
                  {marketLoading
                    ? "LOADING MARKET DATA"
                    : "MARKET CHART"}
                </span>

                <span className="chart-price">
                  {price !== null
                    ? price.toFixed(priceDigits)
                    : "--"}
                </span>
              </div>
            )}
          </div>

          <div className="chart-info">
            <span>
              {chartPoints.length > 0
                ? `${chartPoints.length} price points`
                : "Waiting for market data"}
            </span>

            <span>
              Updated: {lastUpdated || "Loading..."}
            </span>
          </div>

          <div className="auto-refresh">
            <span className="live-dot"></span>
            MARKET DATA AUTO-REFRESH
          </div>

          <button className="refresh" onClick={loadMarket}>
            ↻ Refresh Market Price
          </button>
        </section>

        {/* TRADE PANEL */}

        <section className="trade-card">
          <div className="trade-heading">
            <h2>Trade Panel</h2>
            <span className="demo-chip">DEMO</span>
          </div>

          <label>Contract Type</label>

          <div className="contract-grid">
            {CONTRACTS.map((c) => (
              <button
                key={c.id}
                className={
                  contract === c.id
                    ? "contract active"
                    : "contract"
                }
                onClick={() => setContract(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          {contract === "DIRECTIONAL" && (
            <>
              <label>Direction</label>

              <div className="choice-grid">
                <button
                  className={
                    prediction === "CALL"
                      ? "choice up active"
                      : "choice up"
                  }
                  onClick={() => setPrediction("CALL")}
                >
                  ▲ CALL / UP
                </button>

                <button
                  className={
                    prediction === "PUT"
                      ? "choice down active"
                      : "choice down"
                  }
                  onClick={() => setPrediction("PUT")}
                >
                  ▼ PUT / DOWN
                </button>
              </div>
            </>
          )}

          {contract === "EVEN_ODD" && (
            <>
              <label>Last Digit Prediction</label>

              <div className="choice-grid">
                <button
                  className={
                    prediction === "EVEN"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => setPrediction("EVEN")}
                >
                  EVEN
                </button>

                <button
                  className={
                    prediction === "ODD"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => setPrediction("ODD")}
                >
                  ODD
                </button>
              </div>
            </>
          )}

          {contract === "OVER_UNDER" && (
            <>
              <label>Prediction</label>

              <div className="choice-grid">
                <button
                  className={
                    prediction === "OVER"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => setPrediction("OVER")}
                >
                  OVER
                </button>

                <button
                  className={
                    prediction === "UNDER"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => setPrediction("UNDER")}
                >
                  UNDER
                </button>
              </div>

              <label>Target Price</label>

              <input
                type="number"
                step="any"
                placeholder="Enter target price"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
              />
            </>
          )}

          {contract === "MATCHES_DIFFERS" && (
            <>
              <label>Prediction</label>

              <div className="choice-grid">
                <button
                  className={
                    prediction === "MATCHES"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => setPrediction("MATCHES")}
                >
                  MATCHES
                </button>

                <button
                  className={
                    prediction === "DIFFERS"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => setPrediction("DIFFERS")}
                >
                  DIFFERS
                </button>
              </div>

              <label>Select Digit</label>

              <div className="digit-grid">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(
                  (digit) => (
                    <button
                      key={digit}
                      className={
                        selectedDigit === String(digit)
                          ? "digit active"
                          : "digit"
                      }
                      onClick={() =>
                        setSelectedDigit(String(digit))
                      }
                    >
                      {digit}
                    </button>
                  )
                )}
              </div>
            </>
          )}

          <label>Demo Stake ($)</label>

          <input
            type="number"
            min="1"
            max="500"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <label>Duration</label>

          <div className="choice-grid">
            <button
              className={
                expiry === "60"
                  ? "choice active"
                  : "choice"
              }
              onClick={() => setExpiry("60")}
            >
              1 MIN
            </button>

            <button
              className={
                expiry === "300"
                  ? "choice active"
                  : "choice"
              }
              onClick={() => setExpiry("300")}
            >
              5 MIN
            </button>
          </div>

          <div className="contract-summary">
            <div>
              <span>Market</span>
              <strong>{asset}</strong>
            </div>

            <div>
              <span>Price</span>
              <strong>
                {price !== null
                  ? price.toFixed(priceDigits)
                  : "--"}
              </strong>
            </div>

            <div>
              <span>Prediction</span>
              <strong>{prediction}</strong>
            </div>

            <div>
              <span>Stake</span>
              <strong>${amount || "0"}</strong>
            </div>

            <div>
              <span>Demo payout estimate</span>
              <strong>
                ${(Number(amount || 0) * 1.8).toFixed(2)}
              </strong>
            </div>
          </div>

          <button
            className="trade-button"
            onClick={placeTrade}
            disabled={loading || price === null}
          >
            {loading
              ? "PLACING DEMO CONTRACT..."
              : "PLACE DEMO CONTRACT"}
          </button>

          {message && (
            <p className="message">{message}</p>
          )}

          <p className="disclaimer">
            AUREVEX is a demo simulator. No real money is
            involved. Outcomes are calculated from market
            prices and are not guaranteed predictions.
          </p>
        </section>

        {/* OPEN CONTRACTS */}

        <section className="history-card">
          <div className="section-heading">
            <h2>Open Contracts</h2>
            <span>{pending.length}</span>
          </div>

          {pending.length === 0 && (
            <p className="muted">No open contracts.</p>
          )}

          {pending.map((trade) => (
            <div className="trade-row" key={trade.id}>
              <div>
                <strong>{trade.asset}</strong>
                <small>
                  {trade.contract_type} · {trade.direction}
                </small>
              </div>

              <div>
                <strong>${trade.amount}</strong>
                <small>
                  {trade.expiry_seconds / 60} min
                </small>
              </div>

              <span className="pending">PENDING</span>
            </div>
          ))}
        </section>

        {/* HISTORY */}

        <section className="history-card">
          <div className="section-heading">
            <h2>Trade History</h2>
            <span>{settled.length}</span>
          </div>

          {settled.length === 0 && (
            <p className="muted">No settled trades yet.</p>
          )}

          {settled.map((trade) => (
            <div className="trade-row" key={trade.id}>
              <div>
                <strong>{trade.asset}</strong>
                <small>
                  {trade.contract_type} · {trade.direction}
                </small>
              </div>

              <div>
                <strong>
                  {trade.status === "WON"
                    ? `+$${trade.simulated_result}`
                    : trade.status === "LOST"
                      ? `-$${trade.amount}`
                      : "Refund"}
                </strong>

                <small>
                  {trade.expiry_price
                    ? `Expiry: ${trade.expiry_price}`
                    : ""}
                </small>
              </div>

              <span
                className={
                  trade.status === "WON"
                    ? "won"
                    : trade.status === "LOST"
                      ? "lost"
                      : "pending"
                }
              >
                {trade.status}
              </span>
            </div>
          ))}
        </section>
      </div>

      <footer>
        AUREVEX · DEMO TRADING PLATFORM
      </footer>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .aurevex {
          min-height: 100vh;
          background: #080b12;
          color: #f1f5f9;
          font-family: Arial, sans-serif;
          padding-bottom: 30px;
        }

        .topbar {
          height: 68px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          background: #0c111b;
          border-bottom: 1px solid #1e293b;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 3px;
        }

        .brand-icon {
          background: linear-gradient(135deg, #00e0a4, #00a879);
          color: #06120e;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          font-size: 22px;
        }

        .demo-label {
          color: #00dfa2;
          font-size: 11px;
          font-weight: bold;
          border: 1px solid #00dfa2;
          padding: 8px 14px;
          border-radius: 20px;
          background: #09241d;
        }

        .dashboard {
          width: 100%;
          max-width: 1400px;
          margin: auto;
          padding: 20px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 18px;
        }

        .market-card,
        .trade-card,
        .history-card {
          background: #0e1521;
          border: 1px solid #1f2b3d;
          border-radius: 14px;
          padding: 20px;
        }

        .market-card {
          min-width: 0;
        }

        .market-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #1f2b3d;
        }

        .muted {
          color: #78879c;
          font-size: 11px;
          letter-spacing: 1px;
        }

        select,
        input {
          width: 100%;
          background: #111c2b;
          color: #f1f5f9;
          border: 1px solid #26364b;
          padding: 13px;
          border-radius: 8px;
          font-size: 15px;
          outline: none;
        }

        select:focus,
        input:focus {
          border-color: #00dfa2;
        }

        select {
          min-width: 140px;
        }

        .price-box {
          text-align: right;
        }

        .price-box h2 {
          margin: 5px 0;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .price-change {
          display: block;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 7px;
        }

        .live-indicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #00dfa2;
          font-size: 10px;
          font-weight: bold;
        }

        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #00dfa2;
          display: inline-block;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.35; }
          100% { opacity: 1; }
        }

        .chart-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 22px;
        }

        .chart-heading div:first-child {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .chart-heading strong {
          font-size: 15px;
        }

        .chart-heading span {
          font-size: 11px;
          color: #718198;
        }

        .timeframes {
          display: flex;
          gap: 5px;
        }

        .timeframes button {
          background: #111c2b;
          color: #8190a5;
          border: 1px solid #26364b;
          border-radius: 5px;
          padding: 7px 10px;
          font-size: 10px;
        }

        .timeframes .time-active {
          color: #00dfa2;
          border-color: #00dfa2;
          background: #092b21;
        }

        .market-chart {
          margin-top: 16px;
          background: #080e18;
          height: 300px;
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chart-svg {
          width: 100%;
          height: 100%;
        }

        .chart-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: #718198;
          font-size: 12px;
        }

        .chart-price {
          color: #00dfa2;
          font-size: 32px;
          font-weight: bold;
        }

        .chart-info {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
          font-size: 11px;
          color: #718198;
        }

        .auto-refresh {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 14px;
          font-size: 10px;
          color: #00dfa2;
        }

        .refresh {
          margin-top: 14px;
          background: #111c2b;
          color: #9aabc0;
          border: 1px solid #26364b;
          padding: 11px;
          width: 100%;
          border-radius: 8px;
          cursor: pointer;
        }

        .refresh:hover {
          border-color: #00dfa2;
          color: #00dfa2;
        }

        .trade-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        h2 {
          margin-top: 0;
          font-size: 18px;
        }

        .demo-chip {
          background: #092b21;
          color: #00dfa2;
          padding: 5px 8px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: bold;
        }

        label {
          display: block;
          margin: 18px 0 8px;
          font-size: 12px;
          color: #9aabc0;
        }

        .contract-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .contract {
          padding: 12px 5px;
          border-radius: 8px;
          background: #111c2b;
          color: #9aabc0;
          border: 1px solid #26364b;
          font-size: 10px;
          font-weight: bold;
          cursor: pointer;
        }

        .contract.active,
        .choice.active,
        .digit.active {
          border-color: #00dfa2;
          background: #092b21;
          color: #00dfa2;
        }

        .choice-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .choice {
          padding: 14px 8px;
          border-radius: 8px;
          background: #111c2b;
          border: 1px solid #26364b;
          color: #9aabc0;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
        }

        .choice.up.active {
          background: #093326;
          color: #00dfa2;
        }

        .choice.down.active {
          background: #351823;
          color: #ff526d;
          border-color: #ff526d;
        }

        .digit-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .digit {
          padding: 12px 0;
          background: #111c2b;
          color: white;
          border: 1px solid #26364b;
          border-radius: 7px;
          cursor: pointer;
        }

        .contract-summary {
          margin-top: 20px;
          background: #080e18;
          border: 1px solid #1f2b3d;
          border-radius: 10px;
          padding: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .contract-summary div {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .contract-summary span {
          color: #718198;
          font-size: 11px;
        }

        .contract-summary strong {
          font-size: 14px;
        }

        .trade-button {
          width: 100%;
          margin-top: 18px;
          background: linear-gradient(135deg, #00dfa2, #00b880);
          color: #04140e;
          border: none;
          padding: 16px;
          border-radius: 9px;
          font-weight: 900;
          font-size: 13px;
          cursor: pointer;
        }

        .trade-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .message {
          background: #10291f;
          border: 1px solid #1d6046;
          border-radius: 8px;
          padding: 12px;
          color: #00dfa2;
          font-size: 13px;
        }

        .error {
          color: #ff526d;
          font-size: 12px;
        }

        .disclaimer {
          font-size: 10px;
          color: #718198;
          line-height: 1.6;
          margin-top: 15px;
        }

        .history-card {
          grid-column: 1 / -1;
        }

        .section-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .section-heading span {
          color: #00dfa2;
          background: #092b21;
          padding: 5px 9px;
          border-radius: 20px;
          font-size: 11px;
        }

        .trade-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 14px 0;
          border-bottom: 1px solid #1f2b3d;
          font-size: 13px;
        }

        .trade-row div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .trade-row small {
          color: #718198;
          font-size: 11px;
        }

        .won {
          color: #00dfa2;
          font-weight: bold;
        }

        .lost {
          color: #ff526d;
          font-weight: bold;
        }

        .pending {
          color: #e9bd55;
          font-weight: bold;
        }

        footer {
          text-align: center;
          padding: 25px;
          color: #526176;
          font-size: 10px;
          letter-spacing: 3px;
        }

        @media (max-width: 850px) {
          .dashboard {
            grid-template-columns: 1fr;
            padding: 12px;
          }

          .trade-card {
            grid-column: 1;
            grid-row: auto;
          }

          .history-card {
            grid-column: 1;
          }

          .market-card,
          .trade-card,
          .history-card {
            padding: 15px;
          }

          .market-chart {
            height: 250px;
          }
        }

        @media (max-width: 400px) {
          .topbar {
            padding: 0 14px;
          }

          .brand {
            font-size: 18px;
          }

          .price-box h2 {
            font-size: 21px;
          }

          .market-top {
            gap: 10px;
          }

          .market-chart {
            height: 200px;
          }

          .timeframes button {
            padding: 6px;
          }
        }
      `}</style>
    </main>
  );
}
