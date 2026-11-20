
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ASSETS = [
  "Volatility 10 Index",
  "Volatility 15 (1s) Index",
  "Volatility 25 (1s) Index",
  "Volatility 25 Index",
  "Volatility 30 (1s) Index",
  "Volatility 50 (1s) Index",
  "Volatility 50 Index",
  "Volatility 75 (1s) Index",
  "Volatility 75 Index",
  "Volatility 90 (1s) Index"
];

const VOLATILITY_STEPS: Record<string, number> = {
  "Volatility 10 Index": 0.00008,
  "Volatility 15 (1s) Index": 0.00018,
  "Volatility 25 (1s) Index": 0.0003,
  "Volatility 25 Index": 0.00016,
  "Volatility 30 (1s) Index": 0.00038,
  "Volatility 50 (1s) Index": 0.00062,
  "Volatility 50 Index": 0.00032,
  "Volatility 75 (1s) Index": 0.00085,
  "Volatility 75 Index": 0.00052,
  "Volatility 90 (1s) Index": 0.0011
};

const TIMEFRAMES = [
  { label: "1M", value: "1m" },
  { label: "5M", value: "5m" },
  { label: "15M", value: "15m" },
  { label: "1H", value: "1h" }
];

const CONTRACTS = [
  { id: "EVEN_ODD", name: "EVEN / ODD" },
  { id: "OVER_UNDER", name: "OVER / UNDER" },
  { id: "MATCHES_DIFFERS", name: "MATCH / DIFFER" }
];

function makeDigitRound(): number[] {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }

  return digits;
}
export default function Home() {
  const [asset, setAsset] = useState("Volatility 10 Index");
  const [timeframe, setTimeframe] = useState("1m");
  const [contract, setContract] = useState("EVEN_ODD");
  const [prediction, setPrediction] = useState("EVEN");
  const [amount, setAmount] = useState("10");
  const [expiry, setExpiry] = useState("60");
  const [targetPrice, setTargetPrice] = useState("");
  const [selectedDigit, setSelectedDigit] = useState("5");

  const [digitRound, setDigitRound] = useState<number[]>(() => makeDigitRound());
const [digitRoundPosition, setDigitRoundPosition] = useState(0);
  const [price, setPrice] = useState<number | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);
  const [chartPoints, setChartPoints] = useState<number[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [marketError, setMarketError] = useState("");
  const [marketLoading, setMarketLoading] = useState(true);

  const [trades, setTrades] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [realWalletBalance, setRealWalletBalance] = useState<number | null>(null);
const [realWalletError, setRealWalletError] = useState("");
  const [depositAmount, setDepositAmount] = useState("100");
const [depositPhone, setDepositPhone] = useState("");
const [depositLoading, setDepositLoading] = useState(false);
const [depositMessage, setDepositMessage] = useState("");
const [depositReference, setDepositReference] = useState("");
  const [depositStatus, setDepositStatus] = useState("");
const [depositReceipt, setDepositReceipt] = useState("");
const depositKeyRef = useRef("");
  const [walletError, setWalletError] = useState("");
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
const [walletActionAmount, setWalletActionAmount] = useState("100");
const [walletActionLoading, setWalletActionLoading] = useState(false);
const [walletActionMessage, setWalletActionMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [autoMessage, setAutoMessage] = useState("");

  const [activeTab, setActiveTab] = useState("TRADE");
  const [scanResults, setScanResults] = useState<Array<{
  asset: string;
  volatility: number;
  prediction: string;
  quality: number;
  trend: string;
  sampleSize: number;
}>>([]);

const [scanLoading, setScanLoading] = useState(false);
const [scanMessage, setScanMessage] = useState("");
const [bestScannedAsset, setBestScannedAsset] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<"DEMO" | "REAL">("DEMO");

  const [tradeMode, setTradeMode] = useState("MANUAL");
  const [autoTrading, setAutoTrading] = useState(false);
const autoTradingRef = useRef(false);
const autoStartBalanceRef = useRef<number | null>(null);
  const [stopLoss, setStopLoss] = useState("5");
  const [profitTarget, setProfitTarget] = useState("10");
  const [multiplier, setMultiplier] = useState("2");
  const [walletModal, setWalletModal] = useState(false);
  
  const [profileName, setProfileName] = useState("Demo Trader");
  const [profileEmail, setProfileEmail] = useState("demo@aurevex.app");
async function loadWalletTransactions() {
  try {
    const response = await fetch("/api/wallet/transactions", {
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load transactions.");
    }

    setWalletTransactions(data.transactions || []);
  } catch (error: any) {
    console.error("Transaction history error:", error);
  }
}

async function submitWalletAction(action: "DEPOSIT" | "WITHDRAWAL") {
  const amount = Number(walletActionAmount);

  if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
    setWalletActionMessage("Enter an amount between $1 and $5,000.");
    return;
  }

  if (Math.round(amount * 100) !== amount * 100) {
    setWalletActionMessage("Use no more than two decimal places.");
    return;
  }

  if (
    action === "WITHDRAWAL" &&
    (walletBalance === null || amount > walletBalance)
  ) {
    setWalletActionMessage("Insufficient demo balance.");
    return;
  }

  setWalletActionLoading(true);
  setWalletActionMessage("");

  try {
    const response = await fetch("/api/wallet/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, amount })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Wallet action failed.");
    }

    setWalletActionMessage(data.message);
  await loadWallet();
  } catch (error: any) {
    setWalletActionMessage(error.message || "Something went wrong.");
  } finally {
    setWalletActionLoading(false);
  }
}
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

  async function loadRealWallet() {
  try {
    const response = await fetch("/api/real-wallet", {
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Real wallet unavailable");
    }

    setRealWalletBalance(Number(data.availableBalance));
    setRealWalletError("");
  } catch (error: any) {
    setRealWalletError(error.message || "Real wallet unavailable");
  }
}
  async function submitRealDeposit() {
  const amount = Number(depositAmount);

  if (!Number.isInteger(amount) || amount < 1 || amount > 50000) {
    setDepositMessage("Enter a whole-number amount between KES 1 and KES 50,000.");
    return;
  }

  if (!depositPhone.trim()) {
    setDepositMessage("Enter your M-Pesa phone number.");
    return;
  }

  if (!depositKeyRef.current) {
    depositKeyRef.current = crypto.randomUUID();
  }

  setDepositLoading(true);
  setDepositMessage("");
    setDepositStatus("");
setDepositReceipt("");

  try {
    const response = await fetch("/api/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amount * 100,
        phone: depositPhone,
        idempotencyKey: depositKeyRef.current
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Deposit request failed.");
    }

    setDepositReference(data.reference || "");
    setDepositMessage(data.message || "Deposit request submitted.");
    if (data.success === true) {
  depositKeyRef.current = "";
}
  } catch (error: any) {
    setDepositMessage(error.message || "Could not submit deposit.");
  } finally {
    setDepositLoading(false);
  }
}
  async function checkDepositStatus(reference: string) {
  try {
    const response = await fetch(
      `/api/deposits/status?reference=${encodeURIComponent(reference)}`,
      { cache: "no-store" }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not check deposit.");
    }

    setDepositStatus(data.status || "UNKNOWN");
    setDepositReceipt(data.receipt || "");
  } catch (error: any) {
    setDepositMessage(error.message || "Status check failed.");
  }
}
  function runVolatilityScan() {
  if (scanLoading) return;

  setScanLoading(true);
  setScanMessage("Scanning Volatility markets...");
  setScanResults([]);
  setBestScannedAsset("");

  setTimeout(() => {
    const results = ASSETS.map((market) => {
      const step = VOLATILITY_STEPS[market] ?? 0.0002;

      const samples = Array.from({ length: 80 }, () =>
        (Math.random() - 0.5) * step * 2
      );

      const movements = samples.map((value) => Math.abs(value));

      const averageMovement =
        movements.reduce((sum, value) => sum + value, 0) /
        movements.length;

      const positive = samples.filter((value) => value > 0).length;
      const negative = samples.filter((value) => value < 0).length;

      const direction =
        positive > negative
          ? "UP"
          : negative > positive
            ? "DOWN"
            : "SIDEWAYS";

      const consistency =
        Math.max(positive, negative) / samples.length;

      const quality = Math.round(50 + consistency * 45);

      return {
        asset: market,
        volatility: averageMovement * 100000,
        prediction: direction,
        quality,
        trend: direction,
        sampleSize: samples.length
      };
    });

    results.sort(
      (a, b) =>
        b.volatility * (b.quality / 100) -
        a.volatility * (a.quality / 100)
    );

    setScanResults(results);
    setBestScannedAsset(results[0]?.asset ?? "");
    setScanMessage(
      "Scan complete. Results are based on simulated samples."
    );
    setScanLoading(false);
  }, 2000);
}
function loadBestVolatility() {
  if (!bestScannedAsset) {
    setScanMessage("Run a Deep Scan first.");
    return;
  }

  setAsset(bestScannedAsset);
  setActiveTab("TRADE");
  setScanMessage(
    `${bestScannedAsset} selected for the simulated chart.`
  );
}
  function loadMarket() {
  const startPrice = 10000;
  const step = startPrice * (VOLATILITY_STEPS[asset] ?? 0.0002);
  let value = startPrice;

  const openingPoints = Array.from({ length: 40 }, () => {
    value += (Math.random() - 0.5) * step * 2;
    return Number(value.toFixed(2));
  });

  const currentPrice = openingPoints[openingPoints.length - 1];

  setPrice(currentPrice);
  setPreviousPrice(openingPoints[openingPoints.length - 2] ?? currentPrice);
  setChartPoints(openingPoints);
  setLastUpdated(new Date().toLocaleTimeString());
  setMarketError("");
  setMarketLoading(false);
}

function advanceSimulatedMarket() {
  setPrice((current) => {
    if (current === null) return current;

    const step = current * (VOLATILITY_STEPS[asset] ?? 0.0002);
    const unit = Math.pow(10, -priceDigits);

    let next = Number(
      (current + (Math.random() - 0.5) * step * 2).toFixed(priceDigits)
    );

    const currentDigit = Number(
      current.toFixed(priceDigits).slice(-1)
    );

    let nextDigit = Number(
      next.toFixed(priceDigits).slice(-1)
    );

    if (nextDigit === currentDigit) {
      next = Number(
        (next + (Math.random() < 0.5 ? unit : -unit)).toFixed(priceDigits)
      );

      nextDigit = Number(
        next.toFixed(priceDigits).slice(-1)
      );
    }

    setPreviousPrice(current);
    setChartPoints((points) => [...points.slice(-59), next]);
    setLastUpdated(new Date().toLocaleTimeString());

    return next;
  });
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
loadRealWallet();
loadWalletTransactions();

const marketInterval = setInterval(() => {
  advanceSimulatedMarket();

  setDigitRoundPosition((position) => {
    if (position === 9) {
      setDigitRound(makeDigitRound());
      return 0;
    }

    return position + 1;
  });
}, 1000);

const interval = setInterval(() => {
  loadTrades();
loadWallet();
loadRealWallet();
loadWalletTransactions();
}, 10000);

return () => {
  clearInterval(marketInterval);
  clearInterval(interval);
};
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

  function stopAutoTrading(reason: string) {
  autoTradingRef.current = false;
  setAutoTrading(false);
  setAutoMessage(reason);
}
 async function placeTrade(): Promise<boolean> {
    setMessage("");
   if (accountMode === "REAL") {
  setMessage("REAL trading is not enabled yet. Please switch to DEMO.");
  return false;
}

    if (price === null) {
  setMessage("Market price unavailable.");
  return false;
}

    const stake = Number(amount);

   if (!Number.isFinite(stake) || stake < 1 || stake > 100) {
  setMessage("Demo stake must be between $1 and $100.");
  return false;
}

   if (walletBalance === null || stake > walletBalance) {
  setMessage("Insufficient virtual demo balance.");
  return false;
}
   if (
  contract === "OVER_UNDER" &&
  (!targetPrice || Number(targetPrice) <= 0)
) {
  setMessage("Enter a valid target price.");
  return false;
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
      return true;
   } catch (error: any) {
  setMessage(error.message || "Trade failed");
  return false;
} finally {
  setLoading(false);
}
  }

async function runAutoTrading() {
  if (accountMode === "REAL") {
  setAutoMessage("AUTO trading is available in DEMO mode only.");
  return;
}
  if (contract !== "EVEN_ODD") {
    setAutoMessage("AUTO mode currently supports EVEN / ODD only.");
    return;
  }

  if (autoTradingRef.current) return;

  const startingBalance = walletBalance;

  if (startingBalance === null) {
    setAutoMessage("Please wait for your demo wallet to load.");
    return;
  }

  autoStartBalanceRef.current = startingBalance;
  autoTradingRef.current = true;
  setAutoTrading(true);
  setAutoMessage("AUTO trading started.");

  while (autoTradingRef.current) {
    const placed = await placeTrade();

    if (!placed) {
      stopAutoTrading("AUTO stopped because the trade could not be placed.");
      break;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Number(expiry) * 1000 + 2000)
    );

    if (!autoTradingRef.current) break;

    const tradesResponse = await fetch("/api/trades", {
  cache: "no-store"
});

if (!tradesResponse.ok) {
  stopAutoTrading("AUTO stopped: could not verify trade settlement.");
  break;
}

const tradesData = await tradesResponse.json();
const latestTrade = tradesData.trades?.[0];

if (!latestTrade || latestTrade.status === "PENDING") {
  stopAutoTrading("AUTO stopped: previous trade is still pending.");
  break;
}

await loadWallet();
    const walletResponse = await fetch("/api/wallet", {
      cache: "no-store"
    });

    if (!walletResponse.ok) {
      stopAutoTrading("AUTO stopped: could not check your demo balance.");
      break;
    }

    const walletData = await walletResponse.json();
    const currentBalance = Number(walletData.virtualBalance);

    const sessionProfit = currentBalance - startingBalance;
    const lossLimit = Number(stopLoss);
    const profitLimit = Number(profitTarget);

    if (Number.isFinite(profitLimit) && profitLimit > 0 &&
        sessionProfit >= profitLimit) {
      stopAutoTrading("Profit target reached. AUTO stopped.");
      break;
    }

    if (Number.isFinite(lossLimit) && lossLimit > 0 &&
        sessionProfit <= -lossLimit) {
      stopAutoTrading("Stop loss reached. AUTO stopped.");
      break;
    }

    if (currentBalance < Number(amount)) {
      stopAutoTrading("Insufficient demo balance. AUTO stopped.");
      break;
    }
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
  const digitHistory = settled
  .filter(
    (trade) =>
      trade.expiry_digit !== null &&
      trade.expiry_digit !== undefined &&
      Number.isInteger(Number(trade.expiry_digit)) &&
      Number(trade.expiry_digit) >= 0 &&
      Number(trade.expiry_digit) <= 9
  )
  .slice(0, 100);

const oddCount = digitHistory.filter(
  (trade) => Number(trade.expiry_digit) % 2 === 1
).length;

const evenCount = digitHistory.length - oddCount;

const oddRatio = digitHistory.length
  ? oddCount / digitHistory.length
  : 0;

const evenRatio = digitHistory.length
  ? evenCount / digitHistory.length
  : 0;

const digitCounts = Array.from({ length: 10 }, (_, digit) =>
  digitHistory.filter(
    (trade) => Number(trade.expiry_digit) === digit
  ).length
);

const totalDigitHits = digitCounts.reduce(
  (sum, count) => sum + count,
  0
);

const rawShares = digitCounts.map((count) =>
  totalDigitHits > 0 ? (count / totalDigitHits) * 1000 : 0
);

const roundedShares = rawShares.map(Math.floor);

let remainingTenths =
  totalDigitHits > 0
    ? 1000 - roundedShares.reduce((sum, value) => sum + value, 0)
    : 0;

const remainderOrder = rawShares
  .map((value, digit) => ({
    digit,
    remainder: value - Math.floor(value)
  }))
  .sort((a, b) => b.remainder - a.remainder);

for (let i = 0; i < remainingTenths; i++) {
  roundedShares[remainderOrder[i].digit]++;
}

const digitStats = digitCounts.map((count, digit) => ({
  digit,
  count,
  percentage: totalDigitHits > 0
    ? roundedShares[digit] / 10
    : 0
}));

  const priceDigits =
    asset === "USD/JPY"
      ? 3
      : ["EUR/USD", "GBP/USD"].includes(asset)
        ? 5
        : 2;

  const getLastPriceDigit = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return null;

    const formatted = value.toFixed(priceDigits);
    return Number(formatted.slice(-1));
  };

  const currentPriceDigit = getLastPriceDigit(price);
  const previousPriceDigit = getLastPriceDigit(previousPrice);
  
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
            <small>
  {accountMode === "DEMO" ? "DEMO BALANCE" : "REAL WALLET"}
</small>

<strong>
  {accountMode === "DEMO"
    ? walletBalance === null
      ? "Loading..."
      : `$${walletBalance.toFixed(2)}`
    : realWalletBalance === null
      ? "Loading..."
      : `KES ${realWalletBalance.toFixed(2)}`}
</strong>
          </button>

          <div style={{ display: "flex", gap: "6px" }}>
  <button
    onClick={() => setAccountMode("DEMO")}
    style={{
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid #22c55e",
      background: accountMode === "DEMO" ? "#22c55e" : "transparent",
      color: accountMode === "DEMO" ? "#000" : "#fff",
      cursor: "pointer",
    }}
  >
    DEMO
  </button>

  <button
    onClick={() => setAccountMode("REAL")}
    style={{
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid #f59e0b",
      background: accountMode === "REAL" ? "#f59e0b" : "transparent",
      color: accountMode === "REAL" ? "#000" : "#fff",
      cursor: "pointer",
    }}
  >
    REAL
  </button>
</div>
        </div>
      </header>
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
          <small>simulated price</small>
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
                  Simulated market • virtual prices
                </span>
                <span>{lastUpdated || "Updating..."}</span>
              </div>

              {marketError && (
                <p className="error-text">{marketError}</p>
              )}
           <section style={{
  margin: "14px 0",
  padding: "14px",
  border: "1px solid rgba(148,163,184,.22)",
  borderRadius: "14px",
  background: "rgba(15,23,42,.45)"
}}>
  <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
    gap: "3px",
    width: "100%",
    alignItems: "start"
  }}
>
  {digitStats.map(({ digit, count, percentage }) => (
    <div
      key={digit}
      title={`${digit}: ${count} hits`}
      style={{
        minWidth: 0,
        textAlign: "center"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "36px",
          aspectRatio: "1",
          borderRadius: "50%",
          padding: "2px",
          margin: "0 auto 5px",
          background: `conic-gradient(${digit % 2 === 0 ? "#a78bfa" : "#38bdf8"} ${percentage}%, rgba(148,163,184,.18) 0)`
        }}
      >
        <div
  style={{
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  }}
>
  <strong style={{ fontSize: "13px" }}>
    {digit}
  </strong>
          <span style={{
  fontSize: "8px",
  fontWeight: 700,
  color: "#cbd5e1",
  lineHeight: 1
}}>
  {percentage.toFixed(1)}%
</span>

  {digitRound[digitRoundPosition] === digit && (
    <span
      title="Current digit in this simulated round"
      style={{
        position: "absolute",
        width: "7px",
        height: "7px",
        borderRadius: "50%",
        background: "#20d6a0",
        boxShadow: "0 0 5px #20d6a0, 0 0 10px rgba(32,214,160,0.8)",
        bottom: "3px",
        right: "3px"
      }}
    />
  )}
</div>
        
      </div> 
      <div style={{ fontSize: "8px", opacity: 0.65 }}>
        {count}
      </div>
    </div>
  ))}
</div>
               
</section>
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
                  AUTO · TRADING
                </button>
              </div>
              <label>Investment amount</label>

              <div className="amount-input">
                <span>$</span>
                <input
                  type="number"
                  min="1"
                  max="100"
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
                  <label>SELECT YOUR PREDICTION</label>
                  <div className="direction-grid even-odd-grid">
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
                  {tradeMode === "AUTO" && (
  <div className="auto-controls">
    {!autoTrading ? (
      <button
        className="direction active"
        onClick={runAutoTrading}
        disabled={loading}
      >
        START AUTO TRADING
      </button>
    ) : (
      <button
        className="direction odd"
        onClick={() => stopAutoTrading("AUTO trading stopped manually.")}
      >
        STOP TRADING
      </button>
    )}

    <p>{autoMessage}</p>
  </div>
)}
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
                  
                </>
              )}

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

                <div className="three-fields">
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

                  <div>
                    <label>Multiplier (min 2)</label>
                    <input
                      type="number"
                      min="2"
                      step="1"
                      value={multiplier}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || Number(value) >= 2) {
                          setMultiplier(value);
                        }
                      }}
                    />
                  </div>
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
    <span className="section-label">AUREVEX INTELLIGENCE ENGINE</span>
    <h2>VOLATILITY DEEP SCANNER</h2>

    <p>
      Scan all available Volatility indices and identify
      the strongest simulated market conditions.
    </p>

    <div
      style={{
        background: "rgba(245, 166, 35, 0.12)",
        border: "1px solid rgba(245, 166, 35, 0.4)",
        borderRadius: "10px",
        padding: "12px",
        margin: "18px 0",
        textAlign: "left"
      }}
    >
      <strong style={{ color: "#f5a623" }}>
        TEST MODE — SIMULATED DATA
      </strong>
      <p style={{ marginBottom: 0, fontSize: "13px" }}>
        Scanner results are experimental simulations.
        They are not live market signals or guaranteed
        trading predictions.
      </p>
    </div>

    <button
      className="primary-button"
      onClick={runVolatilityScan}
      disabled={scanLoading}
      style={{ width: "100%", margin: "12px 0" }}
    >
      {scanLoading ? "SCANNING MARKETS..." : "✦ RUN DEEP SCAN"}
    </button>

    {scanMessage && (
      <p style={{ margin: "12px 0" }}>{scanMessage}</p>
    )}

    {scanResults.length > 0 && (
      <>
        <div
          className="stat-card"
          style={{ textAlign: "left", margin: "20px 0" }}
        >
          <span className="section-label">BEST SCANNED MARKET</span>
          <h2>{scanResults[0].asset}</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginTop: "16px"
            }}
          >
            <div>
              <small>VOLATILITY LEVEL</small>
              <h3>{scanResults[0].volatility.toFixed(2)}</h3>
            </div>

            <div>
              <small>ANALYSIS QUALITY</small>
              <h3>{scanResults[0].quality}%</h3>
            </div>

            <div>
              <small>SIMULATED PREDICTION</small>
              <h3>{scanResults[0].prediction}</h3>
            </div>

            <div>
              <small>MARKET TREND</small>
              <h3>{scanResults[0].trend}</h3>
            </div>
          </div>

          <button
            className="primary-button"
            onClick={loadBestVolatility}
            style={{ width: "100%", marginTop: "18px" }}
          >
            LOAD BEST VOLATILITY
          </button>
        </div>

        <h3 style={{ textAlign: "left" }}>
          SCAN RANKINGS
        </h3>

        {scanResults.map((result, index) => (
          <div
            key={result.asset}
            className="stat-card"
            style={{
              textAlign: "left",
              margin: "10px 0",
              padding: "14px"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "10px"
              }}
            >
              <strong>
                {index + 1}. {result.asset}
              </strong>
              <strong>{result.quality}%</strong>
            </div>

            <p style={{ marginBottom: 0 }}>
              Volatility: {result.volatility.toFixed(2)}
              {" · "}
              Prediction: {result.prediction}
            </p>
          </div>
        ))}

        <small>
          Analysis quality measures consistency in the
          simulated sample. It is not a probability of winning.
        </small>
      </>
    )}

    <p className="disclaimer">
      AUREVEX scanner is for demonstration and testing.
      Loading a market only changes the displayed chart.
      It does not place or execute real-money trades.
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

        {activeTab === "WALLET" && accountMode === "DEMO" && (
          <section className="page-card">
            <span className="section-label">VIRTUAL ACCOUNT</span>
            <h2>Demo Wallet</h2>

            <div className="wallet-balance-card">
              <small>AVAILABLE VIRTUAL BALANCE</small>
              <strong>
                {walletBalance === null
                  ? "Loading..."
                  : `$${walletBalance.toFixed(2)}`}
              </strong>
              <span>DEMO FUNDS ONLY</span>
            </div>

            <div className="notice-card">
              <strong>Demo wallet notice</strong>
              <p>
                This is a simulation using virtual funds only.
                No real deposits are collected and no real withdrawals
                or payouts are sent.
              </p>
            </div>

            <h3>Demo transaction amount (USD)</h3>
            <input
              type="number"
              min="1"
              max="5000"
              step="0.01"
              value={walletActionAmount}
              onChange={(e) => setWalletActionAmount(e.target.value)}
              placeholder="Enter amount"
            />

            <button
              className="trade-submit"
              disabled={walletActionLoading}
              onClick={() => submitWalletAction("DEPOSIT")}
            >
              {walletActionLoading ? "PROCESSING..." : "ADD DEMO FUNDS"}
            </button>

            <button
              className="trade-submit"
              disabled={walletActionLoading}
              onClick={() => submitWalletAction("WITHDRAWAL")}
            >
              {walletActionLoading ? "PROCESSING..." : "WITHDRAW DEMO FUNDS"}
            </button>

            {walletActionMessage && (
              <div className="trade-message">
                {walletActionMessage}
              </div>
            )}

            {walletError && (
              <div className="trade-message">{walletError}</div>
            )}

            <h3>Wallet transaction history</h3>

            {walletTransactions.length === 0 ? (
              <p className="empty-state">
                No demo wallet transactions yet.
              </p>
            ) : (
              walletTransactions.map((transaction) => (
                <div className="trade-row" key={transaction.id}>
                  <div>
                    <strong>
                      {transaction.transaction_type === "DEMO_CREDIT"
                        ? "Demo deposit"
                        : transaction.transaction_type === "DEMO_DEBIT"
                          ? "Demo withdrawal"
                          : transaction.transaction_type}
                    </strong>
                    <small>
                      {new Date(transaction.created_at).toLocaleString()}
                    </small>
                  </div>
                  <div>
                    <strong>
                      {transaction.transaction_type === "DEMO_CREDIT"
                        ? "+"
                        : "-"}
                      ${Number(transaction.amount).toFixed(2)}
                    </strong>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "WALLET" && accountMode === "REAL" && (
  <section className="page-card">
    <span className="section-label">REAL ACCOUNT</span>
    <h2>Real Wallet</h2>

    <div className="wallet-balance-card">
      <small>AVAILABLE BALANCE</small>
      <strong>
        {realWalletBalance === null
          ? "Loading..."
          : `KES ${realWalletBalance.toFixed(2)}`}
      </strong>
      <span>TEST MODE ONLY</span>
    </div>

    {realWalletError && (
      <div className="trade-message">{realWalletError}</div>
    )}

    <div className="notice-card">
      <strong>Payment testing mode</strong>
      <p>
        This wallet is currently in test mode. No live deposits,
        withdrawals or real-money trading are enabled.
      </p>
    </div>

    <div className="wallet-form">
  <label>Deposit amount (KES)</label>
  <input
    type="number"
    min="1"
    max="50000"
    step="1"
    value={depositAmount}
    onChange={(e) => setDepositAmount(e.target.value)}
    placeholder="Enter amount"
  />

  <label>M-Pesa phone number</label>
  <input
    type="tel"
    value={depositPhone}
    onChange={(e) => setDepositPhone(e.target.value)}
    placeholder="07XXXXXXXX"
  />

  <button
    className="trade-submit"
    onClick={submitRealDeposit}
    disabled={depositLoading}
  >
    {depositLoading ? "PROCESSING..." : "REQUEST TEST DEPOSIT"}
  </button>

  {depositMessage && (
    <div className="trade-message">{depositMessage}</div>
  )}

  {depositReference && (
    <p>Reference: {depositReference}</p>
  )}
      {depositStatus && (
  <p>Deposit status: {depositStatus}</p>
)}

{depositReceipt && (
  <p>M-Pesa receipt: {depositReceipt}</p>
)}

{depositReference && (
  <button
    className="trade-submit"
    onClick={() => checkDepositStatus(depositReference)}
  >
    CHECK DEPOSIT STATUS
  </button>
)}
</div>

    <button className="trade-submit" disabled>
      WITHDRAW — COMING SOON
    </button>
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

            <a
              href="/settings"
              className="settings-row"
              style={{
                textDecoration: "none",
                color: "inherit"
              }}
            >
              <div>
                <strong>Change Password</strong>
                <small>Update your account password securely</small>
              </div>
              <span className="coming-soon">OPEN →</span>
            </a>

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
          grid-template-columns: 1fr;
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
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
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 3px;
}

.digit {
  padding: 8px 1px;
  font-size: 10px;
}

        .digit { padding: 8px 1px; font-size: 10px; }

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
        .three-fields {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .three-fields input {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
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
            padding: 9px;
            border-radius: 11px;
          }
          .three-fields {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 5px;
          }

          .three-fields label {
            font-size: 8px;
          }

          .three-fields input {
            padding: 7px 3px;
            font-size: 11px;
          }

          .card-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .timeframes { width: 100%; }
          .timeframes button { flex: 1; }
          .chart { height: 120px; }
          .chart-toolbar { gap: 8px; }
          .toolbar-group { flex-wrap: wrap; }
          .chart-price-row strong { font-size: 22px; }
          .contract, .direction {
  padding: 8px 3px;
  font-size: 9px;
}

.trade-card label {
  margin: 7px 0 4px;
  font-size: 9px;
}
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
        /* AUREVEX dashboard visual upgrade */
.aurevex {
  background:
    radial-gradient(ellipse at 15% 0%, #251641 0%, transparent 38%),
    radial-gradient(ellipse at 90% 20%, #102b3b 0%, transparent 35%),
    #080d18;
}

.topbar {
  background: rgba(12, 18, 34, .96);
  backdrop-filter: blur(14px);
  border-bottom-color: #49356e;
}

.brand {
  letter-spacing: 2.5px;
}

.brand-icon {
  box-shadow: 0 0 20px #9b5cff66;
}

.chart-card,
.trade-card,
.positions-card,
.page-card,
.placeholder-card {
  background: linear-gradient(145deg, #151f33, #0e1727);
  border: 1px solid #34415d;
  box-shadow: 0 12px 35px #0005;
  transition: border-color .2s, transform .2s;
}

.chart-card:hover,
.trade-card:hover {
  border-color: #7955bd;
}

.chart {
  background:
    linear-gradient(#ffffff08 1px, transparent 1px),
    linear-gradient(90deg, #ffffff08 1px, transparent 1px),
    #091323;
  background-size: 35px 35px;
  border: 1px solid #273650;
}

.contract {
  min-height: 48px;
  font-size: 11px;
  letter-spacing: .4px;
}

.contract.active {
  background: linear-gradient(135deg, #54338c, #302052);
  border-color: #b18bff;
  box-shadow: 0 0 16px #8958e944;
}

.direction {
  min-height: 58px;
  font-size: 13px;
  letter-spacing: 1px;
}

.direction.even.active {
  box-shadow: 0 0 18px #29c99a33;
}

.direction.odd.active {
  box-shadow: 0 0 18px #ed5b8433;
}

.trade-submit {
  min-height: 50px;
  background: linear-gradient(100deg, #965cf5, #5934bc);
  box-shadow: 0 7px 20px #7544c744;
  transition: filter .2s, transform .2s;
}

.trade-submit:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-2px);
}

button {
  transition: border-color .2s, background .2s, color .2s;
}

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid #b18bff;
  outline-offset: 3px;
}

.market-strip {
  background: rgba(14, 23, 38, .92);
}

.wallet-balance-card {
  box-shadow: 0 10px 30px #0004;
}

@media (max-width: 600px) {
  .chart-card,
  .trade-card,
  .positions-card,
  .page-card {
    box-shadow: 0 8px 24px #0005;
  }

  .direction {
    min-height: 55px;
    font-size: 12px;
  }

  .trade-submit {
    min-height: 52px;
  }
}
.even-odd-grid button {
  min-height: 75px;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: 2px;
  border-radius: 12px;
}

.even-odd-grid .even {
  border-color: #238e70;
}

.even-odd-grid .odd {
  border-color: #a83d61;
}

.even-odd-grid .even.active {
  background: linear-gradient(135deg, #12664e, #123e35);
  box-shadow: 0 0 22px #29c99a55;
}

.even-odd-grid .odd.active {
  background: linear-gradient(135deg, #872c4c, #421d30);
  box-shadow: 0 0 22px #ed5b8455;
}
/* AUREVEX PREMIUM TRADE SUMMARY */

.trade-summary {
  padding: 20px;
  margin: 22px 0;
  background: linear-gradient(145deg, #192943, #101a2b);
  border: 1px solid #59417e;
  border-radius: 13px;
  box-shadow: 0 8px 25px #0005;
}

.trade-summary div {
  padding: 12px 0;
  border-bottom: 1px solid #ffffff12;
  font-size: 12px;
}

.trade-summary div:last-child {
  border-bottom: none;
  margin-top: 5px;
  padding-top: 16px;
}

.trade-summary div:last-child strong {
  color: #39e5ad;
  font-size: 19px;
}

.trade-summary span {
  color: #9baac1;
}

.trade-summary strong {
  font-weight: 900;
  color: #ffffff;
}
      `}</style>
    </main>
  );
}
