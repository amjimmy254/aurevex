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
        {
          cache: "no-store",
        }
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
      ? "#16c784"
      : priceUp
        ? "#16c784"
        : "#ff5370";

  const chartColor =
    chartPoints.length > 1 &&
    chartPoints[chartPoints.length - 1] >= chartPoints[0]
      ? "#16c784"
      : "#ff5370";

  return (
    <main className="aurevex">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">A</span>
          AUREVEX
        </div>

        <span className="demo-label">
          DEMO TRADING
        </span>
      </header>

      <div className="dashboard">

        {/* MARKET */}

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
              <p className="muted">LIVE MARKET PRICE</p>

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
                LIVE MARKET FEED
              </span>
            </div>
          </div>

          {marketError && (
            <p className="error">
              {marketError}
            </p>
          )}

          {/* LIVE CHART */}

          <div className="market-chart">
            {chartPoints.length > 1 ? (
              <svg
                viewBox="0 0 600 180"
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

                <polygon
                  fill="url(#chartGradient)"
                  points={`0,180 ${chartPoints
                    .map((point, index) => {
                      const x =
                        (index / (chartPoints.length - 1)) *
                        600;

                      const y =
                        160 -
                        ((point - chartMin) / chartRange) *
                          140;

                      return `${x},${y}`;
                    })
                    .join(" ")} 600,180`}
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
                        160 -
                        ((point - chartMin) / chartRange) *
                          140;

                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
              </svg>
            ) : (
              <div className="chart-placeholder">
                <span>
                  {marketLoading
                    ? "LOADING LIVE MARKET"
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
            AUTOMATIC REFRESH EVERY 10 SECONDS
          </div>

          <button
            className="refresh"
            onClick={loadMarket}
          >
            ↻ Refresh Market Price
          </button>
        </section>

        {/* TRADING */}

        <section className="trade-card">
          <h2>Place Demo Contract</h2>

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

          {/* UP / DOWN */}

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

          {/* EVEN / ODD */}

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

          {/* OVER / UNDER */}

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
                onChange={(e) =>
                  setTargetPrice(e.target.value)
                }
              />
            </>
          )}

          {/* MATCHES / DIFFERS */}

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
                  onClick={() =>
                    setPrediction("MATCHES")
                  }
                >
                  MATCHES
                </button>

                <button
                  className={
                    prediction === "DIFFERS"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() =>
                    setPrediction("DIFFERS")
                  }
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

          {/* STAKE */}

          <label>Demo Stake ($)</label>

          <input
            type="number"
            min="1"
            max="500"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          {/* DURATION */}

          <label>Contract Duration</label>

          <div className="choice-grid">
            <button
              className={
                expiry === "60"
                  ? "choice active"
                  : "choice"
              }
              onClick={() => setExpiry("60")}
            >
              1 MINUTE
            </button>

            <button
              className={
                expiry === "300"
                  ? "choice active"
                  : "choice"
              }
              onClick={() => setExpiry("300")}
            >
              5 MINUTES
            </button>
          </div>

          {/* SUMMARY */}

          <div className="contract-summary">
            <div>
              <span>Market</span>
              <strong>{asset}</strong>
            </div>

            <div>
              <span>Current Price</span>
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
              <span>Demo Stake</span>
              <strong>${amount || "0"}</strong>
            </div>

            <div>
              <span>Potential Return</span>
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
              ? "PLACING CONTRACT..."
              : "PLACE DEMO CONTRACT"}
          </button>

          {message && (
            <p className="message">
              {message}
            </p>
          )}

          <p className="disclaimer">
            AUREVEX is a demo simulator. No real money is
            involved. Outcomes are calculated from market
            prices and are not guaranteed predictions.
          </p>
        </section>

        {/* OPEN CONTRACTS */}

        <section className="history-card">
          <h2>Open Contracts</h2>

          {pending.length === 0 && (
            <p className="muted">
              No open contracts.
            </p>
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

              <span className="pending">
                PENDING
              </span>
            </div>
          ))}
        </section>

        {/* HISTORY */}

        <section className="history-card">
          <h2>Trade History</h2>

          {settled.length === 0 && (
            <p className="muted">
              No settled trades yet.
            </p>
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
          background: #080d17;
          color: #e8edf7;
          font-family: Arial, sans-serif;
          padding-bottom: 30px;
        }

        .topbar {
          height: 65px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          border-bottom: 1px solid #1d2939;
          background: #0d1523;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .brand-icon {
          background: #16c784;
          color: #07120e;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 9px;
        }

        .demo-label {
          color: #16c784;
          font-size: 11px;
          border: 1px solid #16c784;
          padding: 7px 10px;
          border-radius: 20px;
        }

        .dashboard {
          width: 100%;
          max-width: 1000px;
          margin: auto;
          padding: 16px;
          display: grid;
          gap: 16px;
        }

        .market-card,
        .trade-card,
        .history-card {
          background: #111b2b;
          border: 1px solid #233247;
          border-radius: 15px;
          padding: 18px;
        }

        .market-top {
          display: flex;
          justify-content: space-between;
          gap: 20px;
        }

        .muted {
          color: #8190a5;
          font-size: 12px;
        }

        select,
        input {
          width: 100%;
          background: #09111e;
          color: white;
          border: 1px solid #304158;
          padding: 13px;
          border-radius: 9px;
          font-size: 16px;
        }

        select {
          min-width: 130px;
        }

        .price-box {
          text-align: right;
        }

        .price-box h2 {
          margin: 5px 0;
          font-size: 25px;
          font-weight: bold;
        }

        .price-change {
          display: block;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .live-indicator {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #16c784;
          font-size: 10px;
        }

        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #16c784;
          display: inline-block;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% {
            opacity: 1;
          }

          50% {
            opacity: 0.3;
          }

          100% {
            opacity: 1;
          }
        }

        .market-chart {
          margin-top: 20px;
          background: #09111e;
          height: 180px;
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
          gap: 10px;
          color: #8190a5;
          font-size: 12px;
        }

        .chart-price {
          color: #16c784;
          font-size: 28px;
          font-weight: bold;
        }

        .chart-info {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 10px;
          color: #8190a5;
        }

        .auto-refresh {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 12px;
          font-size: 10px;
          color: #16c784;
        }

        .refresh {
          margin-top: 12px;
          background: transparent;
          color: #9aacc2;
          border: 1px solid #304158;
          padding: 10px;
          width: 100%;
          border-radius: 8px;
        }

        h2 {
          margin-top: 0;
          font-size: 19px;
        }

        label {
          display: block;
          margin: 17px 0 8px;
          font-size: 13px;
          color: #a6b4c8;
        }

        .contract-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .contract {
          padding: 12px 5px;
          border-radius: 8px;
          background: #09111e;
          color: #a6b4c8;
          border: 1px solid #304158;
          font-size: 11px;
        }

        .contract.active,
        .choice.active,
        .digit.active {
          border-color: #16c784;
          background: #123629;
          color: #16c784;
        }

        .choice-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .choice {
          padding: 13px;
          border-radius: 9px;
          background: #09111e;
          border: 1px solid #304158;
          color: #a6b4c8;
          font-weight: bold;
        }

        .choice.up.active {
          background: #123629;
          color: #16c784;
        }

        .choice.down.active {
          background: #351d29;
          color: #ff5370;
          border-color: #ff5370;
        }

        .digit-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .digit {
          padding: 12px 0;
          background: #09111e;
          color: white;
          border: 1px solid #304158;
          border-radius: 8px;
        }

        .contract-summary {
          margin-top: 20px;
          background: #09111e;
          border-radius: 10px;
          padding: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .contract-summary div {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .contract-summary span {
          color: #8190a5;
          font-size: 12px;
        }

        .contract-summary strong {
          font-size: 14px;
        }

        .trade-button {
          width: 100%;
          margin-top: 18px;
          background: #16c784;
          color: #07120e;
          border: none;
          padding: 16px;
          border-radius: 10px;
          font-weight: 800;
          font-size: 15px;
        }

        .trade-button:disabled {
          opacity: 0.5;
        }

        .message {
          background: #172536;
          border-radius: 8px;
          padding: 12px;
          color: #16c784;
          font-size: 13px;
        }

        .error {
          color: #ff5370;
          font-size: 12px;
        }

        .disclaimer {
          font-size: 11px;
          color: #8190a5;
          line-height: 1.6;
          margin-top: 15px;
        }

        .trade-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 14px 0;
          border-bottom: 1px solid #233247;
          font-size: 13px;
        }

        .trade-row div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .trade-row small {
          color: #8190a5;
          font-size: 11px;
        }

        .won {
          color: #16c784;
        }

        .lost {
          color: #ff5370;
        }

        .pending {
          color: #e5b84b;
        }

        footer {
          text-align: center;
          padding: 20px;
          color: #58677c;
          font-size: 11px;
          letter-spacing: 2px;
        }

        @media (max-width: 400px) {
          .market-top {
            gap: 10px;
          }

          .price-box h2 {
            font-size: 20px;
          }

          .market-card,
          .trade-card,
          .history-card {
            padding: 14px;
          }
        }
      `}</style>
    </main>
  );
}
