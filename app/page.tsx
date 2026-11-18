
"use client";

import { useEffect, useState } from "react";

const ASSETS = ["EUR/USD", "GBP/USD", "USD/JPY", "BTC/USD", "ETH/USD", "GOLD/USD"];

const CONTRACTS = [
  { id: "DIRECTIONAL", name: "UP / DOWN" },
  { id: "EVEN_ODD", name: "EVEN / ODD" },
  { id: "OVER_UNDER", name: "OVER / UNDER" },
  { id: "MATCHES_DIFFERS", name: "MATCH / DIFFER" },
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
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletError, setWalletError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("TRADE");
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadWallet() {
    try {
      const response = await fetch("/api/wallet", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Wallet unavailable");

      setWalletBalance(Number(data.virtualBalance));
      setWalletError("");
    } catch (error: any) {
      setWalletError(error.message || "Wallet unavailable");
    }
  }

  async function loadMarket() {
    try {
      const response = await fetch(
        `/api/market?asset=${encodeURIComponent(asset)}&t=${Date.now()}`,
        { cache: "no-store" }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Market unavailable");

      const currentPrice = Number(data.price);
      if (!Number.isFinite(currentPrice)) throw new Error("Invalid price");

      setPrice((old) => {
        if (old !== null && old !== currentPrice) setPreviousPrice(old);
        return currentPrice;
      });

      if (Array.isArray(data.points)) {
        const values = data.points
          .map((point: any) =>
            typeof point === "number"
              ? point
              : Number(point.close ?? point.price ?? point.value ?? point.open)
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
      const response = await fetch("/api/trades", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setTrades(data.trades || []);
    } catch {
      console.log("Trades unavailable");
    }
  }

  useEffect(() => {
    setPrice(null);
    setPreviousPrice(null);
    setChartPoints([]);
    setMarketLoading(true);

    loadMarket();
    loadTrades();
    loadWallet();

    const interval = setInterval(() => {
      loadMarket();
      loadTrades();
      loadWallet();
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

    if (contract === "OVER_UNDER" && (!targetPrice || Number(targetPrice) <= 0)) {
      setMessage("Enter a valid target price.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset,
          contractType: contract,
          prediction,
          amount: stake,
          expirySeconds: Number(expiry),
          targetPrice: contract === "OVER_UNDER" ? Number(targetPrice) : null,
          selectedDigit: contract === "MATCHES_DIFFERS" ? Number(selectedDigit) : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Trade failed");

      setMessage("Demo trade placed successfully.");
      await Promise.all([loadTrades(), loadWallet()]);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  const pending = trades.filter((trade) => trade.status === "PENDING");
  const settled = trades.filter((trade) => trade.status !== "PENDING");

  const priceDigits = asset === "USD/JPY" ? 3 :
    ["EUR/USD", "GBP/USD"].includes(asset) ? 5 : 2;

  const chartMin = chartPoints.length ? Math.min(...chartPoints) : 0;
  const chartMax = chartPoints.length ? Math.max(...chartPoints) : 0;
  const chartRange = chartMax - chartMin || 1;

  const priceUp = previousPrice !== null && price !== null && price >= previousPrice;
  const chartColor = chartPoints.length > 1 &&
    chartPoints[chartPoints.length - 1] >= chartPoints[0]
    ? "#a855f7" : "#ec4899";

  return (
    <main className="aurevex">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>

        <div className="brand">
          <span className="brand-icon">A</span>
          <span>AUREVEX</span>
        </div>

        <div className="balance">
          <small>DEMO BALANCE</small>
          <strong>
            {walletBalance === null ? "Loading..." : `$${walletBalance.toFixed(2)}`}
          </strong>
        </div>

        <button className="profile-button" onClick={() => setMenuOpen(!menuOpen)}>
          ◉
        </button>
      </header>

      {menuOpen && (
        <div className="menu-panel">
          <div className="menu-title">AUREVEX MENU</div>
          <button onClick={() => setActiveTab("TRADE")}>Trading Dashboard</button>
          <button onClick={() => setActiveTab("POSITIONS")}>Trade History</button>
          <button onClick={() => setMenuOpen(false)}>Close Menu</button>
          <button
            className="logout"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Log Out
          </button>
        </div>
      )}

      {walletError && <div className="error-banner">{walletError}</div>}

      <div className="market-strip">
        <div className="market-selector">
          <span className="market-icon">◈</span>
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            {ASSETS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>

        <div className="market-price">
          <small>MARKET PRICE</small>
          <strong className={priceUp ? "positive" : "negative"}>
            {price !== null ? price.toFixed(priceDigits) : "--"}
          </strong>
        </div>

        <div className="market-status">
          <span className="pulse"></span>
          <small>DEMO MARKET</small>
        </div>
      </div>

      <div className="dashboard">
        {activeTab === "TRADE" && (
          <>
            <section className="chart-card">
              <div className="card-heading">
                <div>
                  <h2>{asset}</h2>
                  <small>Price movement</small>
                </div>
                <div className="timeframes">
                  <button className="selected">1M</button>
                  <button>5M</button>
                  <button>15M</button>
                  <button>1H</button>
                </div>
              </div>

              <div className="chart">
                {chartPoints.length > 1 ? (
                  <svg viewBox="0 0 600 260" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="fillChart" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity=".3" />
                        <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {[50, 100, 150, 200].map((y) => (
                      <line key={y} x1="0" y1={y} x2="600" y2={y}
                        stroke="#302442" strokeDasharray="4 5" />
                    ))}

                    <polygon
                      fill="url(#fillChart)"
                      points={`0,260 ${chartPoints.map((p, i) => {
                        const x = i / (chartPoints.length - 1) * 600;
                        const y = 230 - ((p - chartMin) / chartRange) * 200;
                        return `${x},${y}`;
                      }).join(" ")} 600,260`}
                    />

                    <polyline
                      fill="none"
                      stroke={chartColor}
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={chartPoints.map((p, i) => {
                        const x = i / (chartPoints.length - 1) * 600;
                        const y = 230 - ((p - chartMin) / chartRange) * 200;
                        return `${x},${y}`;
                      }).join(" ")}
                    />
                  </svg>
                ) : (
                  <div className="chart-loading">
                    <div className="loader"></div>
                    {marketLoading ? "LOADING MARKET DATA" : "CHART DATA UNAVAILABLE"}
                  </div>
                )}
              </div>

              <div className="chart-footer">
                <span><span className="pulse"></span> Market data</span>
                <span>{lastUpdated || "Updating..."}</span>
              </div>

              {marketError && <p className="error-text">{marketError}</p>}
            </section>

            <section className="trade-card">
              <div className="trade-title">
                <h2>Trade</h2>
                <span className="demo-tag">VIRTUAL</span>
              </div>

              <label>Contract type</label>
              <div className="contract-grid">
                {CONTRACTS.map((c) => (
                  <button key={c.id}
                    className={contract === c.id ? "contract active" : "contract"}
                    onClick={() => setContract(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>

              {contract === "DIRECTIONAL" && (
                <>
                  <label>Direction</label>
                  <div className="direction-grid">
                    <button className={prediction === "CALL" ? "direction up active" : "direction up"}
                      onClick={() => setPrediction("CALL")}>▲ UP</button>
                    <button className={prediction === "PUT" ? "direction down active" : "direction down"}
                      onClick={() => setPrediction("PUT")}>▼ DOWN</button>
                  </div>
                </>
              )}

              {contract === "EVEN_ODD" && (
                <>
                  <label>Prediction</label>
                  <div className="direction-grid">
                    <button className={prediction === "EVEN" ? "direction active" : "direction"}
                      onClick={() => setPrediction("EVEN")}>EVEN</button>
                    <button className={prediction === "ODD" ? "direction active" : "direction"}
                      onClick={() => setPrediction("ODD")}>ODD</button>
                  </div>
                </>
              )}

              {contract === "OVER_UNDER" && (
                <>
                  <label>Prediction</label>
                  <div className="direction-grid">
                    <button className={prediction === "OVER" ? "direction active" : "direction"}
                      onClick={() => setPrediction("OVER")}>OVER</button>
                    <button className={prediction === "UNDER" ? "direction active" : "direction"}
                      onClick={() => setPrediction("UNDER")}>UNDER</button>
                  </div>
                  <label>Target price</label>
                  <input type="number" value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="Target price" />
                </>
              )}

              {contract === "MATCHES_DIFFERS" && (
                <>
                  <label>Prediction</label>
                  <div className="direction-grid">
                    <button className={prediction === "MATCHES" ? "direction active" : "direction"}
                      onClick={() => setPrediction("MATCHES")}>MATCHES</button>
                    <button className={prediction === "DIFFERS" ? "direction active" : "direction"}
                      onClick={() => setPrediction("DIFFERS")}>DIFFERS</button>
                  </div>
                  <label>Select digit</label>
                  <div className="digit-grid">
                    {[0,1,2,3,4,5,6,7,8,9].map((d) => (
                      <button key={d} className={selectedDigit === String(d) ? "digit active" : "digit"}
                        onClick={() => setSelectedDigit(String(d))}>{d}</button>
                    ))}
                  </div>
                </>
              )}

              <label>Stake amount</label>
              <div className="amount-input">
                <span>$</span>
                <input type="number" min="1" max="500" value={amount}
                  onChange={(e) => setAmount(e.target.value)} />
              </div>

              <div className="quick-amounts">
                {[1, 5, 10, 25, 50, 100].map((v) => (
                  <button key={v} className={amount === String(v) ? "quick active" : "quick"}
                    onClick={() => setAmount(String(v))}>${v}</button>
                ))}
              </div>

              <label>Duration</label>
              <div className="direction-grid">
                <button className={expiry === "60" ? "direction active" : "direction"}
                  onClick={() => setExpiry("60")}>1 MIN</button>
                <button className={expiry === "300" ? "direction active" : "direction"}
                  onClick={() => setExpiry("300")}>5 MIN</button>
              </div>

              <div className="trade-summary">
                <div><span>Market</span><strong>{asset}</strong></div>
                <div><span>Prediction</span><strong>{prediction}</strong></div>
                <div><span>Stake</span><strong>${amount}</strong></div>
                <div><span>Estimated payout</span><strong>${(Number(amount || 0) * 1.8).toFixed(2)}</strong></div>
              </div>

              <button className="trade-submit" onClick={placeTrade}
                disabled={loading || price === null}>
                {loading ? "PROCESSING..." : "PLACE DEMO TRADE"}
              </button>

              {message && <div className="trade-message">{message}</div>}

              <p className="disclaimer">
                Virtual trading only. No real money or withdrawals.
                Results are not guaranteed.
              </p>
            </section>
          </>
        )}

        {activeTab === "AI" && (
          <section className="placeholder-card">
            <div className="ai-icon">✦</div>
            <h2>AUREVEX AI</h2>
            <p>AI market analysis tools will be displayed here.</p>
            <p className="disclaimer">Analysis is informational and not a guarantee of market outcomes.</p>
          </section>
        )}

        {activeTab === "POSITIONS" && (
          <section className="positions-card">
            <h2>Open Positions</h2>
            {pending.length === 0 && <p>No open demo trades.</p>}
            {pending.map((trade) => (
              <div className="trade-row" key={trade.id}>
                <div><strong>{trade.asset}</strong><small>{trade.contract_type} · {trade.direction}</small></div>
                <div><strong>${trade.amount}</strong><small>{trade.expiry_seconds / 60} min</small></div>
                <span className="pending">PENDING</span>
              </div>
            ))}
            <h2 className="history-title">Trade History</h2>
            {settled.length === 0 && <p>No completed demo trades.</p>}
            {settled.map((trade) => (
              <div className="trade-row" key={trade.id}>
                <div><strong>{trade.asset}</strong><small>{trade.contract_type} · {trade.direction}</small></div>
                <div><strong>{trade.status === "WON" ? `+$${trade.simulated_result}` : trade.status === "LOST" ? `-$${trade.amount}` : "Refund"}</strong></div>
                <span className={trade.status === "WON" ? "won" : trade.status === "LOST" ? "lost" : "pending"}>{trade.status}</span>
              </div>
            ))}
          </section>
        )}
      </div>

      <nav className="bottom-nav">
        <button className={activeTab === "TRADE" ? "nav-item active" : "nav-item"}
          onClick={() => setActiveTab("TRADE")}>
          <span>⌁</span>Trade
        </button>
        <button className={activeTab === "AI" ? "nav-item active" : "nav-item"}
          onClick={() => setActiveTab("AI")}>
          <span>✦</span>AI
        </button>
        <button className={activeTab === "POSITIONS" ? "nav-item active" : "nav-item"}
          onClick={() => setActiveTab("POSITIONS")}>
          <span>◷</span>Positions
        </button>
      </nav>

      <footer>AUREVEX · DEMO TRADING SIMULATOR</footer>

      <style jsx>{`
        * { box-sizing: border-box; }
        .aurevex { min-height: 100vh; background: #100b19; color: #f5f0fa; font-family: Arial, sans-serif; padding-bottom: 90px; }
        .topbar { height: 70px; display:flex; align-items:center; justify-content:space-between; padding:0 18px; background:#1a1226; border-bottom:1px solid #342345; position:sticky; top:0; z-index:10; }
        .brand { display:flex; align-items:center; gap:9px; font-weight:900; letter-spacing:2px; font-size:18px; }
        .brand-icon { width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg,#a855f7,#6d28d9); display:grid; place-items:center; font-size:20px; }
        .menu-button,.profile-button { background:#30203f; color:#d8b4fe; border:1px solid #49345d; border-radius:9px; padding:9px 12px; font-size:18px; }
        .balance { display:flex; flex-direction:column; text-align:right; gap:4px; }
        .balance small { color:#a78bfa; font-size:9px; letter-spacing:1px; }
        .balance strong { color:#fff; font-size:15px; }
        .market-strip { display:flex; align-items:center; justify-content:space-between; gap:10px; background:#1a1226; margin:12px; padding:14px; border:1px solid #342345; border-radius:14px; }
        .market-selector { display:flex; align-items:center; gap:8px; }
        .market-icon { color:#c084fc; font-size:20px; }
        select { background:#261833; color:#fff; border:1px solid #49345d; border-radius:8px; padding:9px; max-width:125px; }
        .market-price { display:flex; flex-direction:column; gap:4px; }
        .market-price small { color:#8e7ba3; font-size:9px; }
        .market-price strong { font-size:17px; }
        .positive { color:#c084fc; } .negative { color:#f472b6; }
        .market-status { display:flex; align-items:center; gap:6px; color:#c084fc; }
        .market-status small { font-size:8px; }
        .pulse { display:inline-block; width:7px; height:7px; border-radius:50%; background:#a855f7; animation:pulse 1.5s infinite; }
        @keyframes pulse { 50% { opacity:.35; } }
        .dashboard { max-width:1200px; margin:auto; padding:0 12px; display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:14px; }
        .chart-card,.trade-card,.positions-card,.placeholder-card { background:#1a1226; border:1px solid #342345; border-radius:15px; padding:16px; min-width:0; }
        .card-heading,.trade-title { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        h2 { font-size:17px; margin:0; }
        .card-heading small { display:block; color:#8e7ba3; margin-top:5px; }
        .timeframes { display:flex; gap:4px; }
        .timeframes button { background:#261833; border:1px solid #49345d; color:#a78bfa; border-radius:6px; padding:7px; font-size:10px; }
        .timeframes .selected { background:#6d28d9; color:#fff; }
        .chart { height:250px; margin-top:14px; background:#120c1b; border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        .chart svg { width:100%; height:100%; }
        .chart-loading { color:#a78bfa; display:flex; flex-direction:column; gap:12px; align-items:center; font-size:10px; }
        .loader { width:22px; height:22px; border:2px solid #49345d; border-top-color:#a855f7; border-radius:50%; animation:spin 1s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .chart-footer { display:flex; justify-content:space-between; margin-top:12px; color:#8e7ba3; font-size:10px; }
        .chart-footer span:first-child { color:#c084fc; }
        .trade-title { margin-bottom:15px; }
        .demo-tag { color:#c084fc; border:1px solid #6d28d9; padding:5px 8px; border-radius:5px; font-size:9px; }
        label { display:block; margin:15px 0 8px; color:#b8a5cc; font-size:11px; }
        .contract-grid,.direction-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
        .contract,.direction { border:1px solid #49345d; background:#261833; color:#a78bfa; border-radius:8px; padding:11px 6px; font-size:10px; font-weight:bold; }
        .contract.active,.direction.active { border-color:#a855f7; background:#46216b; color:#fff; }
        .direction.up.active { background:#3b1b61; } .direction.down.active { background:#501f48; }
        input { width:100%; background:#120c1b; border:1px solid #49345d; border-radius:8px; color:#fff; padding:12px; outline:none; }
        input:focus { border-color:#a855f7; }
        .amount-input { display:flex; align-items:center; background:#120c1b; border:1px solid #49345d; border-radius:8px; padding-left:12px; color:#c084fc; }
        .amount-input input { border:0; background:transparent; }
        .quick-amounts { display:grid; grid-template-columns:repeat(6,1fr); gap:5px; margin-top:8px; }
        .quick { background:#261833; border:1px solid #49345d; border-radius:6px; color:#a78bfa; padding:7px 0; font-size:10px; }
        .quick.active { background:#6d28d9; color:#fff; }
        .digit-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; }
        .digit { background:#261833; border:1px solid #49345d; color:#fff; padding:10px; border-radius:6px; }
        .digit.active { background:#6d28d9; border-color:#a855f7; }
        .trade-summary { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:13px; margin-top:16px; background:#120c1b; border-radius:10px; }
        .trade-summary div { display:flex; flex-direction:column; gap:5px; }
        .trade-summary span { color:#8e7ba3; font-size:10px; }
        .trade-summary strong { font-size:12px; }
        .trade-submit { width:100%; margin-top:14px; border:0; border-radius:9px; padding:15px; background:linear-gradient(135deg,#a855f7,#7c3aed); color:white; font-weight:900; }
        .trade-submit:disabled { opacity:.5; }
        .trade-message { background:#30203f; color:#d8b4fe; border:1px solid #6d28d9; padding:10px; margin-top:10px; border-radius:8px; font-size:12px; }
        .disclaimer { color:#8e7ba3; font-size:9px; line-height:1.5; margin-top:12px; }
        .error-banner,.error-text { color:#f9a8d4; padding:10px; font-size:11px; }
        .positions-card,.placeholder-card { grid-column:1/-1; }
        .trade-row { display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid #342345; padding:14px 0; font-size:12px; }
        .trade-row div { display:flex; flex-direction:column; gap:5px; }
        .trade-row small { color:#8e7ba3; }
        .pending { color:#c084fc; } .won { color:#a855f7; } .lost { color:#f472b6; }
        .history-title { margin-top:25px; }
        .placeholder-card { text-align:center; padding:60px 20px; }
        .ai-icon { font-size:40px; color:#c084fc; margin-bottom:15px; }
        .placeholder-card p { color:#8e7ba3; }
        .bottom-nav { position:fixed; bottom:0; left:0; right:0; height:66px; background:#1a1226; border-top:1px solid #342345; display:flex; justify-content:space-around; align-items:center; z-index:20; }
        .nav-item { display:flex; flex-direction:column; align-items:center; gap:4px; background:none; border:0; color:#8e7ba3; font-size:10px; }
        .nav-item span { font-size:20px; }
        .nav-item.active { color:#c084fc; }
        .menu-panel { position:fixed; top:70px; left:10px; width:220px; background:#21152e; border:1px solid #49345d; border-radius:12px; padding:12px; z-index:30; box-shadow:0 10px 35px #0008; }
        .menu-title { color:#c084fc; font-size:11px; padding:10px; }
        .menu-panel button { display:block; width:100%; text-align:left; background:transparent; color:#e9d5ff; border:0; padding:12px; border-bottom:1px solid #342345; }
        .menu-panel .logout { color:#f472b6; }
        footer { text-align:center; padding:25px; color:#604c75; font-size:9px; letter-spacing:2px; }
        @media(min-width:850px) { .market-strip { max-width:1200px; margin:15px auto; } }
        @media(max-width:850px) { .dashboard { grid-template-columns:1fr; } .trade-card { grid-column:1; } }
        @media(max-width:500px) { .topbar { padding:0 10px; gap:7px; } .brand { font-size:13px; letter-spacing:1px; } .brand-icon { width:28px; height:28px; } .balance strong { font-size:12px; } .balance small { font-size:8px; } .market-strip { padding:10px; } .market-price strong { font-size:13px; } .market-status small { font-size:7px; } .chart { height:190px; } .chart-card,.trade-card,.positions-card { padding:12px; } }
      `}</style>
    </main>
  );
}
