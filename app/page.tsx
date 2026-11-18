
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

const TIMEFRAMES = [
  { label: "1M", value: "1m" },
  { label: "5M", value: "5m" },
  { label: "15M", value: "15m" },
  { label: "1H", value: "1h" },
];

const CONTRACTS = [
  { id: "DIRECTIONAL", name: "UP / DOWN" },
  { id: "EVEN_ODD", name: "EVEN / ODD" },
  { id: "OVER_UNDER", name: "OVER / UNDER" },
  { id: "MATCHES_DIFFERS", name: "MATCH / DIFFER" },
];

export default function Home() {
  const [asset, setAsset] = useState("EUR/USD");
  const [timeframe, setTimeframe] = useState("1m");
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
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletError, setWalletError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("TRADE");
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadWallet() {
    try {
      const response = await fetch("/api/wallet", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Wallet unavailable");
      }

      setWalletBalance(Number(data.virtualBalance));
      setWalletError("");
    } catch (error: any) {
      setWalletError(error.message || "Wallet unavailable");
    }
  }

  async function loadMarket() {
    try {
      const response = await fetch(
        `/api/market?asset=${encodeURIComponent(asset)}&timeframe=${encodeURIComponent(timeframe)}&t=${Date.now()}`,
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

      setPrice((old) => {
        if (old !== null && old !== currentPrice) {
          setPreviousPrice(old);
        }
        return currentPrice;
      });

      if (Array.isArray(data.points)) {
        const values = data.points
          .map((point: any) =>
            typeof point === "number"
              ? point
              : Number(
                  point.close ??
                  point.price ??
                  point.value ??
                  point.open
                )
          )
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
      console.log("Trades unavailable");
    }
  }

  useEffect(() => {
    setPrice(null);
    setPreviousPrice(null);
    setChartPoints([]);
    setMarketLoading(true);
    setMarketError("");

    loadMarket();
    loadTrades();
    loadWallet();

    const interval = setInterval(() => {
      loadMarket();
      loadTrades();
      loadWallet();
    }, 10000);

    return () => clearInterval(interval);
  }, [asset, timeframe]);

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
      setMessage("Market price unavailable.");
      return;
    }

    const stake = Number(amount);

    if (!Number.isFinite(stake) || stake < 1 || stake > 500) {
      setMessage("Demo stake must be between $1 and $500.");
      return;
    }

    if (walletBalance === null || stake > walletBalance) {
      setMessage("Insufficient virtual demo balance.");
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

      setMessage("Demo trade placed successfully.");

      await Promise.all([
        loadTrades(),
        loadWallet(),
      ]);
    } catch (error: any) {
      setMessage(error.message || "Trade failed");
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

  const chartMin = chartPoints.length
    ? Math.min(...chartPoints)
    : 0;

  const chartMax = chartPoints.length
    ? Math.max(...chartPoints)
    : 0;

  const chartRange = chartMax - chartMin || 1;

  const priceUp =
    previousPrice !== null &&
    price !== null &&
    price >= previousPrice;

  const chartColor =
    chartPoints.length > 1 &&
    chartPoints[chartPoints.length - 1] >= chartPoints[0]
      ? "#20d6a0"
      : "#f05b86";

  const chartCoordinates = chartPoints
    .map((point, index) => {
      const x =
        index / Math.max(chartPoints.length - 1, 1) * 600;
      const y =
        225 - ((point - chartMin) / chartRange) * 190;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <main className="aurevex">
      <header className="topbar">
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Open menu"
        >
          ☰
        </button>

        <div className="brand">
          <span className="brand-icon">A</span>
          <span>AUREVEX</span>
        </div>

        <div className="header-actions">
          <div className="balance">
            <small>DEMO BALANCE</small>
            <strong>
              {walletBalance === null
                ? "Loading..."
                : `$${walletBalance.toFixed(2)}`}
            </strong>
          </div>

          <span className="demo-label">DEMO</span>
        </div>
      </header>

      {menuOpen && (
        <>
          <div
            className="menu-overlay"
            onClick={() => setMenuOpen(false)}
          />

          <aside className="menu-panel">
            <div className="menu-brand">
              <span className="brand-icon">A</span>
              <div>
                <strong>AUREVEX</strong>
                <small>TRADING PLATFORM</small>
              </div>
            </div>

            <div className="menu-section">MAIN MENU</div>

            <button onClick={() => {
              setActiveTab("TRADE");
              setMenuOpen(false);
            }}>
              <span>⌁</span> Trading Dashboard
            </button>

            <button onClick={() => {
              setActiveTab("POSITIONS");
              setMenuOpen(false);
            }}>
              <span>◷</span> Positions & History
            </button>

            <button onClick={() => {
              setActiveTab("AI");
              setMenuOpen(false);
            }}>
              <span>✦</span> AUREVEX AI
            </button>

            <div className="menu-section">ACCOUNT</div>

            <div className="menu-balance">
              <small>YOUR VIRTUAL BALANCE</small>
              <strong>
                {walletBalance === null
                  ? "Loading..."
                  : `$${walletBalance.toFixed(2)}`}
              </strong>
            </div>

            <button onClick={() => setMenuOpen(false)}>
              <span>⚙</span> Account Settings
            </button>

            <button onClick={() => setMenuOpen(false)}>
              <span>?</span> Help Centre
            </button>

            <button
              className="logout"
              onClick={async () => {
                await fetch("/api/logout", {
                  method: "POST",
                });
                window.location.href = "/login";
              }}
            >
              <span>↪</span> Log Out
            </button>

            <div className="menu-footer">
              AUREVEX · DEMO ACCOUNT
            </div>
          </aside>
        </>
      )}

      {walletError && (
        <div className="error-banner">{walletError}</div>
      )}

      <section className="market-strip">
        <div className="market-selector">
          <span className="market-icon">◈</span>
          <div>
            <small>SELECT MARKET</small>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
            >
              {ASSETS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="market-price">
          <small>MARKET PRICE</small>
          <strong className={priceUp ? "positive" : "negative"}>
            {price !== null
              ? price.toFixed(priceDigits)
              : "--"}
          </strong>
        </div>

        <div className="market-status">
          <span className="pulse" />
          <span>MARKET DATA</span>
        </div>
      </section>

      <div className="dashboard">
        {activeTab === "TRADE" && (
          <>
            <section className="chart-card">
              <div className="card-heading">
                <div>
                  <span className="section-label">
                    MARKET OVERVIEW
                  </span>
                  <h2>{asset}</h2>
                  <small>
                    Price movement · {timeframe.toUpperCase()}
                  </small>
                </div>

                <div className="timeframes">
                  {TIMEFRAMES.map((item) => (
                    <button
                      key={item.value}
                      className={
                        timeframe === item.value
                          ? "selected"
                          : ""
                      }
                      onClick={() => setTimeframe(item.value)}
                      aria-pressed={
                        timeframe === item.value
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="chart-price-row">
                <div>
                  <small>LAST PRICE</small>
                  <strong>
                    {price !== null
                      ? price.toFixed(priceDigits)
                      : "--"}
                  </strong>
                </div>

                <span className="live-tag">
                  <span className="pulse" />
                  LIVE DATA
                </span>
              </div>

              <div className="chart">
                {chartPoints.length > 1 ? (
                  <svg
                    viewBox="0 0 600 260"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient
                        id="chartFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={chartColor}
                          stopOpacity=".30"
                        />
                        <stop
                          offset="100%"
                          stopColor={chartColor}
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>

                    {[50, 100, 150, 200].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="600"
                        y2={y}
                        stroke="#263448"
                        strokeDasharray="4 6"
                      />
                    ))}

                    <polygon
                      fill="url(#chartFill)"
                      points={`0,260 ${chartCoordinates} 600,260`}
                    />

                    <polyline
                      fill="none"
                      stroke={chartColor}
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={chartCoordinates}
                    />
                  </svg>
                ) : (
                  <div className="chart-loading">
                    <div className="loader" />
                    {marketLoading
                      ? "LOADING MARKET DATA"
                      : "CHART DATA UNAVAILABLE"}
                  </div>
                )}
              </div>

              <div className="chart-footer">
                <span>
                  <span className="pulse" />
                  Market data connection
                </span>
                <span>{lastUpdated || "Updating..."}</span>
              </div>

              {marketError && (
                <p className="error-text">{marketError}</p>
              )}

              <div className="chart-note">
                Prices are supplied by the connected market-data
                provider. The chart is for demonstration purposes.
              </div>
            </section>

            <section className="trade-card">
              <div className="trade-title">
                <div>
                  <span className="section-label">
                    PLACE YOUR TRADE
                  </span>
                  <h2>Trading Panel</h2>
                </div>
                <span className="demo-tag">VIRTUAL</span>
              </div>

              <label>Contract type</label>

              <div className="contract-grid">
                {CONTRACTS.map((item) => (
                  <button
                    key={item.id}
                    className={
                      contract === item.id
                        ? "contract active"
                        : "contract"
                    }
                    onClick={() => setContract(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>

              {contract === "DIRECTIONAL" && (
                <>
                  <label>Choose direction</label>
                  <div className="direction-grid">
                    <button
                      className={
                        prediction === "CALL"
                          ? "direction up active"
                          : "direction up"
                      }
                      onClick={() => setPrediction("CALL")}
                    >
                      ▲ UP
                    </button>

                    <button
                      className={
                        prediction === "PUT"
                          ? "direction down active"
                          : "direction down"
                      }
                      onClick={() => setPrediction("PUT")}
                    >
                      ▼ DOWN
                    </button>
                  </div>
                </>
              )}

              {contract === "EVEN_ODD" && (
                <>
                  <label>Choose prediction</label>
                  <div className="direction-grid">
                    <button
                      className={
                        prediction === "EVEN"
                          ? "direction active"
                          : "direction"
                      }
                      onClick={() => setPrediction("EVEN")}
                    >
                      EVEN
                    </button>

                    <button
                      className={
                        prediction === "ODD"
                          ? "direction active"
                          : "direction"
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
                  <label>Choose prediction</label>
                  <div className="direction-grid">
                    <button
                      className={
                        prediction === "OVER"
                          ? "direction active"
                          : "direction"
                      }
                      onClick={() => setPrediction("OVER")}
                    >
                      OVER
                    </button>

                    <button
                      className={
                        prediction === "UNDER"
                          ? "direction active"
                          : "direction"
                      }
                      onClick={() => setPrediction("UNDER")}
                    >
                      UNDER
                    </button>
                  </div>

                  <label>Target price</label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) =>
                      setTargetPrice(e.target.value)
                    }
                    placeholder="Enter target price"
                  />
                </>
              )}

              {contract === "MATCHES_DIFFERS" && (
                <>
                  <label>Choose prediction</label>
                  <div className="direction-grid">
                    <button
                      className={
                        prediction === "MATCHES"
                          ? "direction active"
                          : "direction"
                      }
                      onClick={() => setPrediction("MATCHES")}
                    >
                      MATCHES
                    </button>

                    <button
                      className={
                        prediction === "DIFFERS"
                          ? "direction active"
                          : "direction"
                      }
                      onClick={() => setPrediction("DIFFERS")}
                    >
                      DIFFERS
                    </button>
                  </div>

                  <label>Select digit</label>
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

              <label>Investment amount</label>

              <div className="amount-input">
                <span>$</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="quick-amounts">
                {[1, 5, 10, 25, 50, 100].map((value) => (
                  <button
                    key={value}
                    className={
                      amount === String(value)
                        ? "quick active"
                        : "quick"
                    }
                    onClick={() => setAmount(String(value))}
                  >
                    ${value}
                  </button>
                ))}
              </div>

              <label>Trade duration</label>

              <div className="direction-grid">
                <button
                  className={
                    expiry === "60"
                      ? "direction active"
                      : "direction"
                  }
                  onClick={() => setExpiry("60")}
                >
                  1 MINUTE
                </button>

                <button
                  className={
                    expiry === "300"
                      ? "direction active"
                      : "direction"
                  }
                  onClick={() => setExpiry("300")}
                >
                  5 MINUTES
                </button>
              </div>

              <div className="trade-summary">
                <div>
                  <span>Market</span>
                  <strong>{asset}</strong>
                </div>

                <div>
                  <span>Prediction</span>
                  <strong>{prediction}</strong>
                </div>

                <div>
                  <span>Investment</span>
                  <strong>${amount || "0"}</strong>
                </div>

                <div>
                  <span>Illustrative payout</span>
                  <strong>
                    ${(Number(amount || 0) * 1.8).toFixed(2)}
                  </strong>
                </div>
              </div>

              <button
                className="trade-submit"
                onClick={placeTrade}
                disabled={loading || price === null}
              >
                {loading
                  ? "PROCESSING..."
                  : "PLACE DEMO TRADE"}
              </button>

              {message && (
                <div className="trade-message">
                  {message}
                </div>
              )}

              <p className="disclaimer">
                Virtual demo trading only. No real money deposits
                or withdrawals. The illustrative payout is not
                guaranteed.
              </p>
            </section>
          </>
        )}

        {activeTab === "AI" && (
          <section className="placeholder-card">
            <div className="ai-icon">✦</div>
            <span className="section-label">INTELLIGENCE</span>
            <h2>AUREVEX AI</h2>
            <p>
              Your market analysis tools will appear here.
            </p>
            <p className="disclaimer">
              Analysis is informational and does not guarantee
              trading outcomes.
            </p>
          </section>
        )}

        {activeTab === "POSITIONS" && (
          <section className="positions-card">
            <span className="section-label">YOUR ACTIVITY</span>
            <h2>Open Positions</h2>

            {pending.length === 0 && (
              <p className="empty-state">
                No open demo trades.
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

                <span className="pending">PENDING</span>
              </div>
            ))}

            <h2 className="history-title">Trade History</h2>

            {settled.length === 0 && (
              <p className="empty-state">
                No completed demo trades.
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
        )}
      </div>

      <nav className="bottom-nav">
        <button
          className={
            activeTab === "TRADE"
              ? "nav-item active"
              : "nav-item"
          }
          onClick={() => setActiveTab("TRADE")}
        >
          <span>⌁</span>
          Trade
        </button>

        <button
          className={
            activeTab === "AI"
              ? "nav-item active"
              : "nav-item"
          }
          onClick={() => setActiveTab("AI")}
        >
          <span>✦</span>
          AI
        </button>

        <button
          className={
            activeTab === "POSITIONS"
              ? "nav-item active"
              : "nav-item"
          }
          onClick={() => setActiveTab("POSITIONS")}
        >
          <span>◷</span>
          Positions
        </button>
      </nav>

      <footer>
        AUREVEX · DEMO TRADING SIMULATOR
      </footer>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .aurevex {
          min-height: 100vh;
          background: #0c0913;
          color: #f5f0fa;
          font-family: Arial, sans-serif;
          padding-bottom: 90px;
        }

        button {
          cursor: pointer;
          font: inherit;
        }

        .topbar {
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0 20px;
          background: #21142f;
          border-bottom: 1px solid #39264e;
          position: sticky;
          top: 0;
          z-index: 15;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 9px;
          font-weight: 900;
          letter-spacing: 2px;
          font-size: 18px;
        }

        .brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #c084fc, #6d28d9);
          display: grid;
          place-items: center;
          color: white;
          font-size: 20px;
          font-weight: 900;
        }

        .menu-button,
        .profile-button {
          background: #30203f;
          color: #e9d5ff;
          border: 1px solid #49345d;
          border-radius: 9px;
          padding: 9px 12px;
          font-size: 18px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .balance {
          display: flex;
          flex-direction: column;
          text-align: right;
          gap: 4px;
        }

        .balance small {
          color: #c084fc;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .balance strong {
          color: #fff;
          font-size: 15px;
        }

        .demo-label,
        .demo-tag {
          color: #d8b4fe;
          border: 1px solid #7540a7;
          background: #30203f;
          padding: 7px 10px;
          border-radius: 20px;
          font-size: 9px;
          font-weight: bold;
        }

        .market-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          max-width: 1250px;
          margin: 16px auto;
          padding: 14px 18px;
          background: #191222;
          border: 1px solid #342345;
          border-radius: 13px;
        }

        .market-selector {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .market-selector > div,
        .market-price {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .market-icon {
          color: #c084fc;
          font-size: 22px;
        }

        .market-strip small {
          color: #9685a8;
          font-size: 9px;
          letter-spacing: 1px;
        }

        select,
        input {
          background: #120c1b;
          color: white;
          border: 1px solid #49345d;
          border-radius: 8px;
          padding: 10px;
          outline: none;
        }

        select {
          max-width: 145px;
        }

        input:focus,
        select:focus {
          border-color: #a855f7;
        }

        .market-price strong {
          font-size: 17px;
        }

        .positive {
          color: #20d6a0;
        }

        .negative {
          color: #f472b6;
        }

        .market-status {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #20d6a0;
          font-size: 9px;
        }

        .pulse {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #20d6a0;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          50% {
            opacity: .35;
          }
        }

        .dashboard {
          max-width: 1250px;
          margin: auto;
          padding: 0 12px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 16px;
        }

        .chart-card,
        .trade-card,
        .positions-card,
        .placeholder-card {
          background: #191222;
          border: 1px solid #342345;
          border-radius: 15px;
          padding: 18px;
          min-width: 0;
        }

        .card-heading,
        .trade-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .section-label {
          display: block;
          color: #a78bfa;
          font-size: 9px;
          letter-spacing: 1.5px;
          margin-bottom: 7px;
        }

        h2 {
          font-size: 17px;
          margin: 0;
        }

        .card-heading small {
          display: block;
          color: #9685a8;
          margin-top: 5px;
          font-size: 10px;
        }

        .timeframes {
          display: flex;
          gap: 4px;
        }

        .timeframes button {
          background: #261833;
          border: 1px solid #49345d;
          color: #c4a5e8;
          border-radius: 6px;
          padding: 8px;
          font-size: 10px;
        }

        .timeframes .selected {
          background: #7c3aed;
          color: white;
          border-color: #a855f7;
        }

        .chart-price-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 22px;
        }

        .chart-price-row > div {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .chart-price-row small {
          color: #9685a8;
          font-size: 9px;
        }

        .chart-price-row strong {
          font-size: 24px;
        }

        .live-tag {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #20d6a0;
          font-size: 9px;
        }

        .chart {
          height: 280px;
          margin-top: 15px;
          background: #100b18;
          border: 1px solid #2b2039;
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chart svg {
          width: 100%;
          height: 100%;
        }

        .chart-loading {
          color: #c084fc;
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
          font-size: 10px;
        }

        .loader {
          width: 23px;
          height: 23px;
          border: 2px solid #49345d;
          border-top-color: #c084fc;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .chart-footer {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
          color: #9685a8;
          font-size: 10px;
        }

        .chart-footer span:first-child {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #c084fc;
        }

        .chart-note {
          margin-top: 15px;
          color: #79698a;
          font-size: 9px;
          line-height: 1.5;
        }

        .trade-title {
          margin-bottom: 18px;
        }

        label {
          display: block;
          margin: 16px 0 8px;
          color: #c5b4d5;
          font-size: 11px;
        }

        .contract-grid,
        .direction-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .contract,
        .direction {
          border: 1px solid #49345d;
          background: #261833;
          color: #c4a5e8;
          border-radius: 8px;
          padding: 12px 6px;
          font-size: 10px;
          font-weight: bold;
        }

        .contract.active,
        .direction.active {
          border-color: #a855f7;
          background: #46216b;
          color: white;
        }

        .direction.up.active {
          background: #123e34;
          border-color: #20d6a0;
          color: #20d6a0;
        }

        .direction.down.active {
          background: #4a1e35;
          border-color: #f472b6;
          color: #f472b6;
        }

        .trade-card input {
          width: 100%;
        }

        .amount-input {
          display: flex;
          align-items: center;
          background: #120c1b;
          border: 1px solid #49345d;
          border-radius: 8px;
          padding-left: 12px;
          color: #c084fc;
        }

        .amount-input input {
          border: 0;
          background: transparent;
        }

        .quick-amounts {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 5px;
          margin-top: 8px;
        }

        .quick {
          background: #261833;
          border: 1px solid #49345d;
          border-radius: 6px;
          color: #c4a5e8;
          padding: 8px 0;
          font-size: 10px;
        }

        .quick.active {
          background: #6d28d9;
          color: white;
        }

        .digit-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }

        .digit {
          background: #261833;
          border: 1px solid #49345d;
          color: white;
          padding: 10px;
          border-radius: 6px;
        }

        .digit.active {
          background: #6d28d9;
          border-color: #a855f7;
        }

        .trade-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 14px;
          margin-top: 17px;
          background: #120c1b;
          border: 1px solid #30203f;
          border-radius: 10px;
        }

        .trade-summary div {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .trade-summary span {
          color: #9685a8;
          font-size: 10px;
        }

        .trade-summary strong {
          font-size: 12px;
        }

        .trade-submit {
          width: 100%;
          margin-top: 15px;
          border: 0;
          border-radius: 9px;
          padding: 16px;
          background: linear-gradient(135deg, #a855f7, #6d28d9);
          color: white;
          font-weight: 900;
          font-size: 12px;
        }

        .trade-submit:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .trade-message {
          background: #30203f;
          color: #e9d5ff;
          border: 1px solid #6d28d9;
          padding: 11px;
          margin-top: 10px;
          border-radius: 8px;
          font-size: 12px;
        }

        .disclaimer {
          color: #9685a8;
          font-size: 9px;
          line-height: 1.6;
          margin-top: 13px;
        }

        .error-banner,
        .error-text {
          color: #f9a8d4;
          padding: 10px;
          font-size: 11px;
        }

        .positions-card,
        .placeholder-card {
          grid-column: 1 / -1;
        }

        .trade-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #342345;
          padding: 15px 0;
          font-size: 12px;
        }

        .trade-row div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .trade-row small {
          color: #9685a8;
        }

        .pending {
          color: #c084fc;
        }

        .won {
          color: #20d6a0;
        }

        .lost {
          color: #f472b6;
        }

        .history-title {
          margin-top: 28px;
        }

        .empty-state {
          color: #9685a8;
          font-size: 12px;
          padding: 15px 0;
        }

        .placeholder-card {
          text-align: center;
          padding: 65px 20px;
        }

        .placeholder-card p {
          color: #9685a8;
        }

        .ai-icon {
          font-size: 42px;
          color: #c084fc;
          margin-bottom: 15px;
        }

        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 68px;
          background: #21142f;
          border-top: 1px solid #39264e;
          display: flex;
          justify-content: space-around;
          align-items: center;
          z-index: 20;
        }

        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: none;
          border: 0;
          color: #9685a8;
          font-size: 10px;
        }

        .nav-item span {
          font-size: 21px;
        }

        .nav-item.active {
          color: #c084fc;
        }

        .menu-overlay {
          position: fixed;
          inset: 0;
          background: #0009;
          z-index: 25;
        }

        .menu-panel {
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          width: min(290px, 85vw);
          background: #1b1226;
          border-right: 1px solid #49345d;
          padding: 22px 16px;
          z-index: 30;
          box-shadow: 10px 0 35px #0008;
          overflow-y: auto;
        }

        .menu-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 25px;
          border-bottom: 1px solid #342345;
        }

        .menu-brand div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .menu-brand small {
          color: #9685a8;
          font-size: 8px;
          letter-spacing: 1px;
        }

        .menu-section {
          color: #a78bfa;
          font-size: 9px;
          letter-spacing: 1.5px;
          margin: 24px 8px 10px;
        }

        .menu-panel > button {
          display: block;
          width: 100%;
          text-align: left;
          background: transparent;
          color: #e9d5ff;
          border: 0;
          border-radius: 8px;
          padding: 13px 10px;
          font-size: 12px;
        }

        .menu-panel > button span {
          display: inline-block;
          width: 28px;
          color: #c084fc;
        }

        .menu-panel > button:hover {
          background: #30203f;
        }

        .menu-panel .logout {
          color: #f472b6;
          margin-top: 15px;
        }

        .menu-balance {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 14px;
          background: #120c1b;
          border: 1px solid #49345d;
          border-radius: 10px;
        }

        .menu-balance small {
          color: #9685a8;
          font-size: 9px;
        }

        .menu-balance strong {
          color: #20d6a0;
          font-size: 20px;
        }

        .menu-footer {
          color: #79698a;
          font-size: 9px;
          text-align: center;
          margin-top: 35px;
        }

        footer {
          text-align: center;
          padding: 25px;
          color: #604c75;
          font-size: 9px;
          letter-spacing: 2px;
        }

        @media (min-width: 850px) {
          .market-strip {
            margin-left: auto;
            margin-right: auto;
          }
        }

        @media (max-width: 850px) {
          .dashboard {
            grid-template-columns: 1fr;
          }

          .trade-card {
            grid-column: 1;
          }

          .market-strip {
            margin: 12px;
          }
        }

        @media (max-width: 500px) {
          .topbar {
            padding: 0 10px;
            gap: 7px;
          }

          .brand {
            font-size: 13px;
            letter-spacing: 1px;
          }

          .brand-icon {
            width: 29px;
            height: 29px;
          }

          .balance strong {
            font-size: 12px;
          }

          .balance small {
            font-size: 8px;
          }

          .demo-label {
            padding: 6px;
            font-size: 8px;
          }

          .market-strip {
            padding: 10px;
          }

          .market-price strong {
            font-size: 13px;
          }

          .market-status {
            font-size: 7px;
          }

          .chart {
            height: 205px;
          }

          .chart-card,
          .trade-card,
          .positions-card {
            padding: 13px;
          }

          .timeframes button {
            padding: 7px 5px;
            font-size: 9px;
          }
        }
      `}</style>
    </main>
  );
}
