
"use client";

import { useEffect, useMemo, useState } from "react";

const ASSETS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "BTC/USD",
  "ETH/USD",
  "GOLD/USD"
];

const TIMEFRAMES = [
  { label: "1M", value: "1m" },
  { label: "5M", value: "5m" },
  { label: "15M", value: "15m" },
  { label: "1H", value: "1h" }
];

const CONTRACTS = [
  { id: "DIRECTIONAL", name: "UP / DOWN" },
  { id: "EVEN_ODD", name: "EVEN / ODD" },
  { id: "OVER_UNDER", name: "OVER / UNDER" },
  { id: "MATCHES_DIFFERS", name: "MATCH / DIFFER" }
];

export default function Home() {
  const [asset, setAsset] = useState("EUR/USD");
  const [timeframe, setTimeframe] = useState("1m");
  const [contract, setContract] = useState("EVEN_ODD");
  const [prediction, setPrediction] = useState("EVEN");
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

  const [tradeMode, setTradeMode] = useState("MANUAL");
  const [stopLoss, setStopLoss] = useState("5");
  const [profitTarget, setProfitTarget] = useState("10");
  const [multiplier, setMultiplier] = useState("1x");

  const [chartZoom, setChartZoom] = useState(1);
  const [chartIndicator, setChartIndicator] = useState("NONE");
  const [drawingTool, setDrawingTool] = useState("CURSOR");

  const [walletModal, setWalletModal] = useState(false);
  const [profileName, setProfileName] = useState("Demo Trader");
  const [profileEmail, setProfileEmail] = useState("demo@aurevex.app");

  async function loadWallet() {
    try {
      const response = await fetch("/api/wallet", {
        cache: "no-store"
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
        cache: "no-store"
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
          "Content-Type": "application/json"
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
              : null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Trade failed");
      }

      setMessage("Demo trade placed successfully.");

      await Promise.all([
        loadTrades(),
        loadWallet()
      ]);
    } catch (error: any) {
      setMessage(error.message || "Trade failed");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
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

  const chartCoordinates = useMemo(
    () =>
      chartPoints
        .map((point, index) => {
          const x =
            index / Math.max(chartPoints.length - 1, 1) * 600;

          const y =
            225 - ((point - chartMin) / chartRange) * 190;

          return `${x},${y}`;
        })
        .join(" "),
    [chartPoints, chartMin, chartRange]
  );

  function goTo(tab: string) {
    setActiveTab(tab);
    setMenuOpen(false);
  }

  return (
    <main className="aurevex">
      <header className="topbar">
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>

        <button
          className="brand brand-button"
          onClick={() => goTo("TRADE")}
        >
          <span className="brand-icon">A</span>
          <span>AUREVEX</span>
        </button>

        <div className="header-actions">
          <button
            className="balance balance-button"
            onClick={() => goTo("WALLET")}
          >
            <small>DEMO BALANCE</small>
            <strong>
              {walletBalance === null
                ? "Loading..."
                : `$${walletBalance.toFixed(2)}`}
            </strong>
          </button>

          <span className="demo-label">DEMO</span>
        </div>
      </header>
      <div
  style={{
    background: "#172554",
    color: "#bfdbfe",
    padding: "12px",
    textAlign: "center",
    fontSize: "13px",
    borderBottom: "1px solid #1e40af"
  }}
>
  AUREVEX SIMULATION MODE — All balances and trade outcomes are virtual.
  Results are for demonstration and testing only.
</div>

      {menuOpen && (
        <>
          <button
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

            <button onClick={() => goTo("TRADE")}>
              <span>⌁</span> Trading Dashboard
            </button>

            <button onClick={() => goTo("POSITIONS")}>
              <span>◷</span> Positions & History
            </button>

            <button onClick={() => goTo("AI")}>
              <span>✦</span> AUREVEX AI
            </button>

            <button onClick={() => goTo("WALLET")}>
              <span>◉</span> Demo Wallet
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

            <button onClick={() => goTo("PROFILE")}>
              <span>♙</span> My Profile
            </button>

            <button onClick={() => goTo("SETTINGS")}>
              <span>⚙</span> Account Settings
            </button>

            <button onClick={() => goTo("HELP")}>
              <span>?</span> Help Centre
            </button>

            <button className="logout" onClick={logout}>
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
            {price !== null ? price.toFixed(priceDigits) : "--"}
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
                  <span className="section-label">MARKET OVERVIEW</span>
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
                        timeframe === item.value ? "selected" : ""
                      }
                      onClick={() => setTimeframe(item.value)}
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

              <div className="chart-toolbar">
                <div className="toolbar-group">
                  <span>ZOOM</span>
                  <button
                    onClick={() =>
                      setChartZoom((z) =>
                        Math.max(1, +(z - 0.25).toFixed(2))
                      )
                    }
                  >
                    −
                  </button>
                  <strong>{chartZoom.toFixed(2)}x</strong>
                  <button
                    onClick={() =>
                      setChartZoom((z) =>
                        Math.min(2.5, +(z + 0.25).toFixed(2))
                      )
                    }
                  >
                    +
                  </button>
                  <button onClick={() => setChartZoom(1)}>
                    Reset
                  </button>
                </div>

                <div className="toolbar-group">
                  <span>INDICATOR</span>
                  <select
                    value={chartIndicator}
                    onChange={(e) =>
                      setChartIndicator(e.target.value)
                    }
                  >
                    <option value="NONE">None</option>
                    <option value="SMA">SMA preview</option>
                    <option value="EMA">EMA preview</option>
                    <option value="RSI">RSI preview</option>
                  </select>
                </div>

                <div className="toolbar-group">
                  <span>TOOL</span>
                  <select
                    value={drawingTool}
                    onChange={(e) =>
                      setDrawingTool(e.target.value)
                    }
                  >
                    <option value="CURSOR">Cursor</option>
                    <option value="TRENDLINE">Trend line</option>
                    <option value="HORIZONTAL">Horizontal line</option>
                    <option value="FIBONACCI">Fibonacci preview</option>
                  </select>
                </div>
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

                    <g
                      transform={`translate(${300 - 300 * chartZoom},0) scale(${chartZoom},1)`}
                    >
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
                    </g>

                    {chartIndicator !== "NONE" && (
                      <text x="14" y="22" fill="#c084fc" fontSize="11">
                        {chartIndicator} · PREVIEW
                      </text>
                    )}

                    {drawingTool !== "CURSOR" && (
                      <text x="14" y="42" fill="#a78bfa" fontSize="10">
                        {drawingTool} TOOL SELECTED · PREVIEW
                      </text>
                    )}
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
                Chart indicators and drawing tools are interface
                previews and are not connected yet.
              </div>
            </section>

            <section className="trade-card">
              <div className="trade-title">
                <div>
                  <span className="section-label">PLACE YOUR TRADE</span>
                  <h2>Trading Panel</h2>
                </div>
                <span className="demo-tag">VIRTUAL</span>
              </div>

              <label>Trading mode</label>

              <div className="direction-grid">
                <button
                  className={tradeMode === "MANUAL" ? "direction active" : "direction"}
                  onClick={() => setTradeMode("MANUAL")}
                >
                  MANUAL
                </button>

                <button
                  className={tradeMode === "AUTO" ? "direction active" : "direction"}
                  onClick={() => setTradeMode("AUTO")}
                >
                  AUTO · PREVIEW
                </button>
              </div>

              {tradeMode === "AUTO" && (
                <p className="preview-note">
                  Auto-trading is a preview. It does not place trades automatically.
                </p>
              )}

              <label>Contract type</label>

              <div className="contract-grid">
                {CONTRACTS.map((item) => (
                  <button
                    key={item.id}
                    className={contract === item.id ? "contract active" : "contract"}
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
                      className={prediction === "CALL" ? "direction up active" : "direction up"}
                      onClick={() => setPrediction("CALL")}
                    >
                      ▲ UP
                    </button>

                    <button
                      className={prediction === "PUT" ? "direction down active" : "direction down"}
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
                      className={prediction === "EVEN" ? "direction even active" : "direction even"}
                      onClick={() => setPrediction("EVEN")}
                    >
                      EVEN
                    </button>

                    <button
                      className={prediction === "ODD" ? "direction odd active" : "direction odd"}
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
                      className={prediction === "OVER" ? "direction active" : "direction"}
                      onClick={() => setPrediction("OVER")}
                    >
                      OVER
                    </button>

                    <button
                      className={prediction === "UNDER" ? "direction active" : "direction"}
                      onClick={() => setPrediction("UNDER")}
                    >
                      UNDER
                    </button>
                  </div>

                  <label>Target price</label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="Enter target price"
                  />
                </>
              )}

              {contract === "MATCHES_DIFFERS" && (
                <>
                  <label>Choose prediction</label>
                  <div className="direction-grid">
                    <button
                      className={prediction === "MATCHES" ? "direction active" : "direction"}
                      onClick={() => setPrediction("MATCHES")}
                    >
                      MATCHES
                    </button>

                    <button
                      className={prediction === "DIFFERS" ? "direction active" : "direction"}
                      onClick={() => setPrediction("DIFFERS")}
                    >
                      DIFFERS
                    </button>
                  </div>

                  <label>Select digit</label>
                  <div className="digit-grid">
                    {[0,1,2,3,4,5,6,7,8,9].map((digit) => (
                      <button
                        key={digit}
                        className={selectedDigit === String(digit) ? "digit active" : "digit"}
                        onClick={() => setSelectedDigit(String(digit))}
                      >
                        {digit}
                      </button>
                    ))}
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
                {[1,5,10,25,50,100].map((value) => (
                  <button
                    key={value}
                    className={amount === String(value) ? "quick active" : "quick"}
                    onClick={() => setAmount(String(value))}
                  >
                    ${value}
                  </button>
                ))}
              </div>

              <label>Trade duration</label>

              <div className="direction-grid">
                <button
                  className={expiry === "60" ? "direction active" : "direction"}
                  onClick={() => setExpiry("60")}
                >
                  1 MINUTE
                </button>

                <button
                  className={expiry === "300" ? "direction active" : "direction"}
                  onClick={() => setExpiry("300")}
                >
                  5 MINUTES
                </button>
              </div>

              <div className="advanced-controls">
                <div className="advanced-heading">
                  <strong>Advanced controls</strong>
                  <span>PREVIEW</span>
                </div>

                <div className="two-fields">
                  <div>
                    <label>Stop loss ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                    />
                  </div>

                  <div>
                    <label>Profit target ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={profitTarget}
                      onChange={(e) => setProfitTarget(e.target.value)}
                    />
                  </div>
                </div>

                <label>Multiplier</label>

                <div className="multiplier-row">
                  {["1x","2x","3x","5x"].map((value) => (
                    <button
                      key={value}
                      className={multiplier === value ? "quick active" : "quick"}
                      onClick={() => setMultiplier(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>

                <p className="preview-note">
                  These advanced controls are display-only and are not applied to trades yet.
                </p>
              </div>

              <div className="trade-summary">
                <div><span>Market</span><strong>{asset}</strong></div>
                <div><span>Prediction</span><strong>{prediction}</strong></div>
                <div><span>Investment</span><strong>${amount || "0"}</strong></div>
                <div>
                  <span>Illustrative payout</span>
                  <strong>${(Number(amount || 0) * 1.8).toFixed(2)}</strong>
                </div>
              </div>

              <button
                className="trade-submit"
                onClick={placeTrade}
                disabled={loading || price === null}
              >
                {loading ? "PROCESSING..." : "PLACE DEMO TRADE"}
              </button>

              {message && (
                <div className="trade-message">{message}</div>
              )}

              <p className="disclaimer">
                Virtual demo trading only. No real-money deposits
                or withdrawals. Illustrative payouts are not guaranteed.
              </p>
            </section>
          </>
        )}

        {activeTab === "AI" && (
          <section className="placeholder-card">
            <div className="ai-icon">✦</div>
            <span className="section-label">INTELLIGENCE</span>
            <h2>AUREVEX AI</h2>
            <p>Your market analysis tools will appear here.</p>
            <span className="coming-soon">COMING SOON</span>
            <p className="disclaimer">
              Analysis is informational and does not guarantee outcomes.
            </p>
          </section>
        )}

        {activeTab === "POSITIONS" && (
          <section className="positions-card">
            <span className="section-label">YOUR ACTIVITY</span>
            <h2>Open Positions</h2>

            {pending.length === 0 && (
              <p className="empty-state">No open demo trades.</p>
            )}

            {pending.map((trade) => (
              <div className="trade-row" key={trade.id}>
                <div>
                  <strong>{trade.asset}</strong>
                  <small>{trade.contract_type} · {trade.direction}</small>
                </div>
                <div>
                  <strong>${trade.amount}</strong>
                  <small>{trade.expiry_seconds / 60} min</small>
                </div>
                <span className="pending">PENDING</span>
              </div>
            ))}

            <h2 className="history-title">Trade History</h2>

            {settled.length === 0 && (
              <p className="empty-state">No completed demo trades.</p>
            )}

            {settled.map((trade) => (
              <div className="trade-row" key={trade.id}>
                <div>
                  <strong>{trade.asset}</strong>
                  <small>{trade.contract_type} · {trade.direction}</small>
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
                <span className={trade.status === "WON" ? "won" : trade.status === "LOST" ? "lost" : "pending"}>
                  {trade.status}
                </span>
              </div>
            ))}
          </section>
        )}

        {activeTab === "WALLET" && (
          <section className="page-card">
            <span className="section-label">VIRTUAL ACCOUNT</span>
            <h2>Demo Wallet</h2>

            <div className="wallet-balance-card">
              <small>AVAILABLE VIRTUAL BALANCE</small>
              <strong>
                {walletBalance === null ? "Loading..." : `$${walletBalance.toFixed(2)}`}
              </strong>
              <span>DEMO FUNDS ONLY</span>
            </div>

            <button
              className="trade-submit"
              onClick={() => setWalletModal(true)}
            >
              VIEW DEMO TOP-UP OPTIONS
            </button>

            <div className="notice-card">
              <strong>Demo wallet notice</strong>
              <p>
                This wallet uses virtual funds. Top-ups are not connected
                yet and no real payment can be made here.
              </p>
            </div>

            <h3>Wallet activity</h3>
            <p className="empty-state">
              Wallet transaction history will appear here when connected.
            </p>
          </section>
        )}

        {activeTab === "PROFILE" && (
          <section className="page-card">
            <span className="section-label">YOUR ACCOUNT</span>
            <h2>My Profile</h2>

            <div className="profile-avatar">A</div>

            <label>Display name</label>
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />

            <label>Email address</label>
            <input
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
            />

            <p className="preview-note">
              Profile edits are local previews and are not saved yet.
            </p>

            <div className="notice-card">
              <strong>Account type</strong>
              <p>Demo trader · Virtual balance · No real-money transactions</p>
            </div>
          </section>
        )}

        {activeTab === "SETTINGS" && (
          <section className="page-card">
            <span className="section-label">PREFERENCES</span>
            <h2>Account Settings</h2>

            <div className="settings-row">
              <div>
                <strong>Account security</strong>
                <small>Password and sign-in options</small>
              </div>
              <span className="coming-soon">COMING SOON</span>
            </div>

            <div className="settings-row">
              <div>
                <strong>Notifications</strong>
                <small>Trade and account notifications</small>
              </div>
              <span className="coming-soon">COMING SOON</span>
            </div>

            <div className="settings-row">
              <div>
                <strong>Appearance</strong>
                <small>Dark AUREVEX theme</small>
              </div>
              <span className="coming-soon">ACTIVE</span>
            </div>
          </section>
        )}

        {activeTab === "HELP" && (
          <section className="page-card">
            <span className="section-label">SUPPORT</span>
            <h2>Help Centre</h2>

            <div className="notice-card">
              <strong>How does AUREVEX work?</strong>
              <p>
                AUREVEX is a demo trading simulator. It displays market data
                and lets you place simulated trades using virtual funds.
              </p>
            </div>

            <div className="notice-card">
              <strong>Can I deposit or withdraw real money?</strong>
              <p>No. The current platform is demo-only.</p>
            </div>

            <div className="notice-card">
              <strong>Are payouts guaranteed?</strong>
              <p>No. Displayed payout figures are illustrative.</p>
            </div>
          </section>
        )}
      </div>

      {walletModal && (
        <div
          className="modal-backdrop"
          onClick={() => setWalletModal(false)}
        >
          <section
            className="wallet-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setWalletModal(false)}
            >
              ×
            </button>

            <span className="section-label">DEMO WALLET</span>
            <h2>Add virtual funds</h2>
            <p>Choose an amount to preview a demo top-up.</p>

            <div className="quick-amounts modal-amounts">
              {[100,250,500,1000].map((value) => (
                <button className="quick" key={value} disabled>
                  ${value}
                </button>
              ))}
            </div>

            <div className="notice-card">
              <strong>Not connected yet</strong>
              <p>
                These are sample options only. They will not change
                your balance until a secure demo-wallet feature is implemented.
              </p>
            </div>

            <button
              className="trade-submit"
              onClick={() => setWalletModal(false)}
            >
              CLOSE
            </button>
          </section>
        </div>
      )}

      <nav className="bottom-nav">
        <button
          className={activeTab === "TRADE" ? "nav-item active" : "nav-item"}
          onClick={() => goTo("TRADE")}
        >
          <span>⌁</span>Trade
        </button>

        <button
          className={activeTab === "AI" ? "nav-item active" : "nav-item"}
          onClick={() => goTo("AI")}
        >
          <span>✦</span>AI
        </button>

        <button
          className={activeTab === "POSITIONS" ? "nav-item active" : "nav-item"}
          onClick={() => goTo("POSITIONS")}
        >
          <span>◷</span>Positions
        </button>

        <button
          className={activeTab === "WALLET" ? "nav-item active" : "nav-item"}
          onClick={() => goTo("WALLET")}
        >
          <span>◉</span>Wallet
        </button>
      </nav>

      <footer>AUREVEX · DEMO TRADING SIMULATOR</footer>

      <style jsx>{`
        .aurevex {
          min-height: 100vh;
          padding-bottom: 85px;
          background: #080d18;
          color: #eef2ff;
          font-family: Arial, Helvetica, sans-serif;
        }

        * { box-sizing: border-box; }
        button, input, select { font: inherit; }
        button { cursor: pointer; }

        .topbar {
          height: 72px;
          padding: 0 4%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #101827;
          border-bottom: 1px solid #263448;
          position: sticky;
          top: 0;
          z-index: 20;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #fff;
          font-size: 19px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .brand-button { background: transparent; border: 0; }

        .brand-icon {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg,#9b5cff,#5433c7);
          border-radius: 10px;
          color: white;
          font-weight: 900;
          font-size: 20px;
        }

        .menu-button {
          background: transparent;
          color: #e6eaff;
          border: 0;
          font-size: 24px;
        }

        .header-actions { display: flex; align-items: center; gap: 12px; }

        .balance {
          display: flex;
          flex-direction: column;
          text-align: right;
          gap: 4px;
        }

        .balance-button { background: transparent; border: 0; color: white; }
        .balance small, .market-price small { color: #8795ad; font-size: 9px; letter-spacing: 1px; }
        .balance strong { font-size: 15px; color: #34d9a3; }

        .demo-label, .demo-tag {
          background: #263b32;
          color: #47e0aa;
          border: 1px solid #28634c;
          padding: 6px 9px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
        }

        .market-strip {
          min-height: 78px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 12px 4%;
          background: #0e1726;
          border-bottom: 1px solid #263448;
        }

        .market-selector { display: flex; align-items: center; gap: 12px; }

        .market-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          background: #292044;
          color: #bd94ff;
          border-radius: 10px;
          font-size: 22px;
        }

        .market-selector small, .market-price small {
          display: block;
          margin-bottom: 5px;
          color: #8795ad;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .market-selector select {
          color: white;
          background: transparent;
          border: 0;
          outline: 0;
          font-weight: 800;
        }

        .market-selector option { color: #111827; }
        .market-price strong { font-size: 17px; }
        .positive, .won { color: #34d9a3; }
        .negative, .lost { color: #fb668b; }

        .market-status, .live-tag {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #42d9a5;
          font-size: 10px;
          font-weight: 800;
        }

        .pulse {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #35dba5;
          box-shadow: 0 0 10px #35dba5;
        }

        .dashboard {
          width: min(1400px, 94%);
          margin: 24px auto;
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, .85fr);
          align-items: start;
          gap: 20px;
        }

        .chart-card, .trade-card, .positions-card, .page-card, .placeholder-card {
          background: #111b2b;
          border: 1px solid #263448;
          border-radius: 14px;
          padding: 22px;
          min-width: 0;
        }

        .card-heading, .trade-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .section-label {
          color: #a78bfa;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        h2 { margin: 7px 0; font-size: 21px; }
        .card-heading small { color: #8997ad; font-size: 12px; }

        .timeframes {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: #091220;
          border-radius: 8px;
        }

        .timeframes button {
          padding: 8px 10px;
          background: transparent;
          border: 0;
          color: #8997ad;
          border-radius: 6px;
          font-size: 11px;
        }

        .timeframes button.selected { background: #7147d5; color: white; }

        .chart-price-row {
          display: flex;
          align-items: end;
          justify-content: space-between;
          margin: 25px 0 15px;
        }

        .chart-price-row small {
          display: block;
          color: #8997ad;
          font-size: 9px;
          margin-bottom: 6px;
        }

        .chart-price-row strong { font-size: 27px; }

        .chart-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          padding: 10px;
          background: #0a1423;
          border: 1px solid #263448;
          border-radius: 8px;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #a9b6ca;
          font-size: 10px;
        }

        .toolbar-group span {
          color: #75849b;
          font-size: 9px;
          font-weight: 800;
        }

        .toolbar-group button, .toolbar-group select {
          background: #172439;
          border: 1px solid #34435a;
          color: #e6eaff;
          border-radius: 5px;
          padding: 5px 8px;
          font-size: 10px;
        }

        .toolbar-group strong { font-size: 10px; }

        .chart {
          width: 100%;
          height: 300px;
          margin-top: 15px;
          background: #0b1524;
          border-radius: 9px;
          overflow: hidden;
        }

        .chart svg { width: 100%; height: 100%; }

        .chart-loading {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 15px;
          color: #8d9bb1;
          font-size: 11px;
          letter-spacing: 1px;
        }

        .loader {
          width: 25px;
          height: 25px;
          border: 3px solid #34435a;
          border-top-color: #a78bfa;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .chart-footer {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 13px 0 5px;
          color: #8997ad;
          font-size: 10px;
        }

        .chart-footer span:first-child {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .chart-note, .preview-note {
          margin-top: 12px;
          color: #8d9bb1;
          font-size: 10px;
          line-height: 1.6;
        }

        .error-text, .error-banner { color: #ff8ba8; font-size: 12px; }
        .error-banner { padding: 10px 4%; background: #381b2b; }

        .trade-card { position: sticky; top: 90px; }
        .trade-title { margin-bottom: 22px; }

        .trade-card label, .page-card label {
          display: block;
          color: #a9b6ca;
          font-size: 11px;
          font-weight: 700;
          margin: 17px 0 8px;
        }

        .contract-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .contract, .direction, .quick, .digit {
          border: 1px solid #34435a;
          background: #0b1524;
          color: #a9b6ca;
          border-radius: 7px;
          padding: 12px 8px;
          font-size: 10px;
          font-weight: 800;
          transition: .2s;
        }

        .contract.active, .direction.active, .quick.active, .digit.active {
          border-color: #9b78ff;
          background: #302052;
          color: white;
          box-shadow: 0 0 12px #7544c733;
        }

        .direction-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .direction.up.active, .direction.even.active {
          background: #123e35;
          border-color: #29c99a;
          color: #54e5b4;
        }

        .direction.down.active, .direction.odd.active {
          background: #421d30;
          border-color: #ed5b84;
          color: #ff83a2;
        }

        .digit-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 7px;
        }

        .digit { padding: 10px 5px; }

        .trade-card input, .page-card input {
          width: 100%;
          min-width: 0;
          padding: 12px;
          color: white;
          background: #0a1423;
          border: 1px solid #34435a;
          border-radius: 7px;
          outline: none;
        }

        .trade-card input:focus, .page-card input:focus {
          border-color: #a78bfa;
        }

        .amount-input {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #0a1423;
          border: 1px solid #34435a;
          border-radius: 7px;
          padding-left: 12px;
          color: #36dca7;
          font-weight: 900;
        }

        .amount-input input { border: 0; background: transparent; }

        .quick-amounts, .multiplier-row {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 6px;
          margin-top: 9px;
        }

        .quick { padding: 9px 3px; font-size: 10px; }

        .advanced-controls {
          padding: 14px;
          margin-top: 17px;
          background: #0a1423;
          border: 1px solid #263448;
          border-radius: 9px;
        }

        .advanced-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .advanced-heading span {
          color: #c5a0ff;
          font-size: 9px;
          font-weight: 900;
        }

        .two-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .multiplier-row { grid-template-columns: repeat(4, 1fr); }

        .trade-summary {
          margin: 18px 0;
          padding: 13px;
          background: #0a1423;
          border-radius: 8px;
        }

        .trade-summary div {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 0;
          font-size: 11px;
        }

        .trade-summary span { color: #8997ad; }
        .trade-summary strong { color: #e9edfa; }
        .trade-summary div:last-child strong { color: #39dca8; }

        .trade-submit {
          width: 100%;
          padding: 15px;
          border: 0;
          border-radius: 8px;
          background: linear-gradient(100deg,#8252e8,#5934bc);
          color: white;
          font-weight: 900;
          font-size: 12px;
          letter-spacing: .7px;
        }

        .trade-submit:disabled { opacity: .5; cursor: not-allowed; }

        .trade-message {
          padding: 11px;
          margin-top: 10px;
          background: #1b2b3c;
          border-radius: 7px;
          color: #d5c4ff;
          font-size: 11px;
          text-align: center;
        }

        .disclaimer {
          color: #7f8da3;
          font-size: 10px;
          line-height: 1.6;
          text-align: center;
          margin: 13px 0 0;
        }

        .positions-card, .page-card, .placeholder-card {
          grid-column: 1 / -1;
          width: 100%;
        }

        .trade-row {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 16px 10px;
          border-bottom: 1px solid #263448;
        }

        .trade-row div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .trade-row strong { font-size: 12px; }
        .trade-row small { color: #8997ad; font-size: 10px; }
        .trade-row > span { font-size: 9px; font-weight: 900; }
        .pending { color: #e9c66c; }
        .history-title { margin-top: 30px; }

        .empty-state {
          padding: 25px 10px;
          color: #8997ad;
          text-align: center;
          font-size: 12px;
        }

        .wallet-balance-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 25px;
          margin: 20px 0;
          background: linear-gradient(135deg,#29204a,#172b43);
          border: 1px solid #5c4692;
          border-radius: 12px;
        }

        .wallet-balance-card small {
          color: #b8a8dc;
          font-size: 10px;
          letter-spacing: 1px;
        }

        .wallet-balance-card strong {
          color: #50e0b0;
          font-size: 32px;
        }

        .wallet-balance-card span {
          color: #c3b5e7;
          font-size: 9px;
        }

        .notice-card {
          padding: 16px;
          margin: 15px 0;
          background: #0a1423;
          border: 1px solid #263448;
          border-radius: 9px;
        }

        .notice-card strong { color: #d9c9ff; font-size: 12px; }
        .notice-card p {
          color: #9ba9bd;
          font-size: 11px;
          line-height: 1.7;
          margin: 8px 0 0;
        }

        .page-card h3 { margin-top: 28px; font-size: 15px; }

        .profile-avatar, .ai-icon {
          width: 70px;
          height: 70px;
          display: grid;
          place-items: center;
          margin: 20px 0;
          border-radius: 50%;
          background: linear-gradient(135deg,#9b5cff,#5433c7);
          color: white;
          font-size: 32px;
          font-weight: 900;
        }

        .settings-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 18px 5px;
          border-bottom: 1px solid #263448;
        }

        .settings-row div {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .settings-row strong { font-size: 12px; }
        .settings-row small { color: #8997ad; font-size: 10px; }

        .coming-soon {
          padding: 6px 8px;
          border-radius: 5px;
          background: #30254a;
          color: #c8a8ff;
          font-size: 9px;
          font-weight: 900;
          white-space: nowrap;
        }

        .placeholder-card { text-align: center; padding: 55px 20px; }
        .placeholder-card .ai-icon { margin: 0 auto 20px; }
        .placeholder-card p {
          color: #8997ad;
          font-size: 12px;
          line-height: 1.7;
        }

        .placeholder-card .coming-soon {
          display: inline-block;
          margin-top: 12px;
        }

        .menu-overlay {
          position: fixed;
          inset: 0;
          z-index: 29;
          background: #0009;
          border: 0;
        }

        .menu-panel {
          position: fixed;
          z-index: 30;
          top: 0;
          left: 0;
          bottom: 0;
          width: min(310px, 85vw);
          overflow-y: auto;
          padding: 24px 17px;
          background: #111b2b;
          border-right: 1px solid #34435a;
          box-shadow: 15px 0 40px #0006;
        }

        .menu-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 30px;
        }

        .menu-brand div { display: flex; flex-direction: column; gap: 5px; }
        .menu-brand strong { letter-spacing: 1.5px; }
        .menu-brand small { color: #8997ad; font-size: 9px; }

        .menu-section {
          margin: 23px 8px 10px;
          color: #77869d;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.4px;
        }

        .menu-panel > button {
          display: flex;
          align-items: center;
          gap: 13px;
          width: 100%;
          padding: 13px 10px;
          margin: 3px 0;
          text-align: left;
          color: #dce5f5;
          background: transparent;
          border: 0;
          border-radius: 7px;
          font-size: 12px;
        }

        .menu-panel > button:hover { background: #222e43; }
        .menu-panel > button span { color: #b18bff; font-size: 18px; }
        .menu-panel > button.logout { color: #ff7e9d; margin-top: 20px; }

        .menu-balance {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 14px;
          background: #0a1423;
          border-radius: 8px;
        }

        .menu-balance small { color: #8997ad; font-size: 9px; }
        .menu-balance strong { color: #3fdfaa; font-size: 19px; }
        .menu-footer {
          padding: 25px 5px 5px;
          color: #718096;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: grid;
          place-items: center;
          padding: 18px;
          background: #000b;
        }

        .wallet-modal {
          position: relative;
          width: min(420px, 100%);
          padding: 25px;
          background: #111b2b;
          border: 1px solid #46516a;
          border-radius: 14px;
        }

        .wallet-modal h2 { margin-top: 12px; }
        .wallet-modal > p {
          color: #8997ad;
          font-size: 12px;
          line-height: 1.6;
        }

        .modal-close {
          position: absolute;
          top: 12px;
          right: 14px;
          background: transparent;
          border: 0;
          color: white;
          font-size: 25px;
        }

        .modal-amounts {
          grid-template-columns: repeat(2, 1fr);
          margin: 20px 0;
        }

        .bottom-nav { display: none; }

        footer {
          padding: 25px;
          text-align: center;
          color: #66758b;
          font-size: 9px;
          letter-spacing: 1.5px;
        }

        @media (max-width: 900px) {
          .dashboard { grid-template-columns: 1fr; }
          .trade-card { position: static; }
        }

        @media (max-width: 600px) {
          .topbar { height: 62px; padding: 0 13px; }
          .brand { font-size: 15px; gap: 7px; }
          .brand-icon { width: 29px; height: 29px; font-size: 17px; }
          .balance small { font-size: 8px; }
          .balance strong { font-size: 12px; }
          .demo-label { padding: 5px 6px; font-size: 8px; }
          .header-actions { gap: 7px; }

          .market-strip { padding: 12px; gap: 8px; }
          .market-icon { width: 32px; height: 32px; }
          .market-selector select { max-width: 105px; font-size: 12px; }
          .market-price strong { font-size: 13px; }
          .market-status { font-size: 8px; }

          .dashboard {
            width: 100%;
            margin: 12px auto;
            padding: 0 10px;
            gap: 12px;
          }

          .chart-card, .trade-card, .positions-card, .page-card, .placeholder-card {
            padding: 15px;
            border-radius: 11px;
          }

          .card-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .timeframes { width: 100%; }
          .timeframes button { flex: 1; }
          .chart { height: 220px; }
          .chart-toolbar { gap: 8px; }
          .toolbar-group { flex-wrap: wrap; }
          .chart-price-row strong { font-size: 22px; }
          .contract, .direction { padding: 13px 5px; }
          .trade-row { grid-template-columns: 1fr auto; }
          .trade-row > span { grid-column: 2; }

          .bottom-nav {
            position: fixed;
            z-index: 25;
            bottom: 0;
            left: 0;
            right: 0;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            padding: 8px 5px calc(8px + env(safe-area-inset-bottom));
            background: #111b2b;
            border-top: 1px solid #34435a;
          }

          .nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: 5px 2px;
            background: transparent;
            border: 0;
            color: #8492a8;
            font-size: 9px;
          }

          .nav-item span { font-size: 19px; }
          .nav-item.active { color: #bd9aff; }
          footer { padding-bottom: 30px; }
        }
      `}</style>
    </main>
  );
}
