
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
const USD_TO_KES_RATE = 130;

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
];


function makeDigitPercentages(): number[] {
  const endings = Array.from({ length: 10 }, (_, i) => i);

  for (let i = 9; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [endings[i], endings[j]] = [endings[j], endings[i]];
  }

  const whole = endings.map(digit =>
    digit === 5 ? 7 : digit <= 4 ? 8 : 7
  );

  let remaining = 95 - whole.reduce((a, b) => a + b, 0);

  while (remaining > 0) {
    const available = whole
      .map((value, index) => index)
      .filter(index =>
        whole[index] < (endings[index] <= 5 ? 12 : 11)
      );

    const index = available[
      Math.floor(Math.random() * available.length)
    ];

    whole[index]++;
    remaining--;
  }

  return whole.map((value, index) =>
    value * 10 + endings[index]
  );
}
function makeVolatilityPercentages(): Record<string, number[]> {
  return Object.fromEntries(
    ASSETS.map((asset) => [asset, makeDigitPercentages()])
  );
}
export default function Home() {
  const [asset, setAsset] = useState("Volatility 10 Index");
  const [timeframe, setTimeframe] = useState("1m");
  const [contract, setContract] = useState("EVEN_ODD");
  const [prediction, setPrediction] = useState("EVEN");
  const [amount, setAmount] = useState("1");
  const [expiry, setExpiry] = useState("60");
  const [targetPrice, setTargetPrice] = useState("");
  const [selectedDigit, setSelectedDigit] = useState("5");
  const [chartClock, setChartClock] = useState("");

useEffect(() => {
  const updateClock = () => {
    setChartClock(new Date().toLocaleTimeString());
  };

  updateClock();
  const interval = setInterval(updateClock, 1000);

  return () => clearInterval(interval);
}, []);
  const [glowingTick, setGlowingTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setGlowingTick((current) => {
        const next = Math.floor(Math.random() * 7);
        return next === current ? (current + 1) % 7 : next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const [volatilityPercentages, setVolatilityPercentages] = useState<
  Record<string, number[]>
>(() => makeVolatilityPercentages());
  const [price, setPrice] = useState<number | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);
  const [chartPoints, setChartPoints] = useState<number[]>([]);
const [realChartPoints, setRealChartPoints] = useState<number[]>([]);

const [digitChartPoints, setDigitChartPoints] = useState<number[]>([]);
const [realDigitChartPoints, setRealDigitChartPoints] = useState<number[]>([]);
const [realChartPrice, setRealChartPrice] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [marketError, setMarketError] = useState("");
  const [marketLoading, setMarketLoading] = useState(true);

  const [trades, setTrades] = useState<any[]>([]);
  const [realTrades, setRealTrades] = useState<any[]>([]);
const [realTradesError, setRealTradesError] = useState("");
  const [activeEvenOddTrade, setActiveEvenOddTrade] = useState<{
  id: string;
  prediction: string;
} | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [realWalletBalance, setRealWalletBalance] = useState<number | null>(null);
const [realWalletError, setRealWalletError] = useState("");
  const [walletError, setWalletError] = useState("");
const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
const [walletActionAmount, setWalletActionAmount] = useState("100");
const [walletActionLoading, setWalletActionLoading] = useState(false);
const [walletActionMessage, setWalletActionMessage] = useState("");
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
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
const scanLastAssetRef = useRef("");

useEffect(() => {
  return () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
  };
}, []);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("TRADE");
  const [menuOpen, setMenuOpen] = useState(false);
 const [accountMode, setAccountMode] = useState<"DEMO" | "REAL">("REAL");
  const [tradeMode, setTradeMode] = useState("AUTO");
  const [autoTrading, setAutoTrading] = useState(false);
  const [autoMessage, setAutoMessage] = useState("");
  const [autoContract, setAutoContract] = useState("");
const [autoPrediction, setAutoPrediction] = useState("");
const autoTradingRef = useRef(false);
const autoStartBalanceRef = useRef<number | null>(null);
  const [stopLoss, setStopLoss] = useState("999");
  const [profitTarget, setProfitTarget] = useState("100");
  const [multiplier, setMultiplier] = useState("2");
  const [walletModal, setWalletModal] = useState(false);
  
  const [profileName, setProfileName] = useState("real Trader");
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

  if (!Number.isFinite(amount) || amount < 5 || amount > 5000) {
  setWalletActionMessage("Enter an amount between $5 and $5,000.");
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

  function runVolatilityScan() {
  // If already running, stop the scanner.
  if (scanLoading) {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    setScanLoading(false);
    setScanMessage("Deep Scan stopped.");
    return;
  }

  // Generate the next simulated best market.
  function refreshBestMarket() {
    const candidates = ASSETS.filter(
      (market) => market !== scanLastAssetRef.current
    );

    const market =
      candidates[Math.floor(Math.random() * candidates.length)] ??
      ASSETS[0];

    scanLastAssetRef.current = market;

    const step = VOLATILITY_STEPS[market] ?? 0.0002;

    const samples = Array.from(
      { length: 80 },
      () => (Math.random() - 0.5) * step * 2
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

    // Simulated quality between 47% and 75%, inclusive.
    const quality = Math.floor(Math.random() * 29) + 47;

    const result = {
      asset: market,
      volatility: averageMovement * 100000,
      prediction: direction,
      quality,
      trend: direction,
      sampleSize: samples.length
    };

    setScanResults([result]);
    setBestScannedAsset(market);

    setScanMessage(
      "Simulated scan refreshed. Next market change in 5 seconds."
    );
  }

  // Start the scanner.
  setScanLoading(true);
  setScanMessage("Starting simulated Deep Scan...");

  scanLastAssetRef.current = bestScannedAsset;

  // Show the first result immediately.
  refreshBestMarket();

  // Refresh every 5 seconds.
  scanIntervalRef.current = setInterval(
    refreshBestMarket,
    5000
  );
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

  const openingPoints = Array.from({ length: 30 }, () => {
    value += (Math.random() - 0.5) * step * 2;
    return Number(value.toFixed(priceDigits));
  });

  const currentPrice = openingPoints[openingPoints.length - 1];
    const realStartPrice = startPrice * 1.015;
let realValue = realStartPrice;

const realOpeningPoints = Array.from({ length: 30 }, () => {
  realValue += (Math.random() - 0.5) * step * 3.4;
  return Number(realValue.toFixed(priceDigits));
});

setRealChartPoints(realOpeningPoints);
setRealChartPrice(realOpeningPoints[realOpeningPoints.length - 1]);
    setDigitChartPoints(
  openingPoints.map(point => Number(point.toFixed(priceDigits).slice(-1)))
);

setRealDigitChartPoints(
  realOpeningPoints.map(point => Number(point.toFixed(priceDigits).slice(-1)))
);

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

    const nextDigit = Number(
      next.toFixed(priceDigits).slice(-1)
    );

    if (nextDigit === currentDigit) {
      next = Number(
        (next + (Math.random() < 0.5 ? unit : -unit)).toFixed(priceDigits)
      );
    }

    setPreviousPrice(current);
    setChartPoints((points) => [...points.slice(-29), next]);
    setDigitChartPoints((points) => [
  ...points.slice(-29),
  Number(next.toFixed(priceDigits).slice(-1))
]);
    setLastUpdated(new Date().toLocaleTimeString());

    return next;
  });
}

function advanceRealSimulatedMarket() {
  setRealChartPrice((current) => {
    if (current === null) return current;

    const step = current * (VOLATILITY_STEPS[asset] ?? 0.0002);

    const next = Number(
      (current + (Math.random() - 0.5) * step * 3.4).toFixed(priceDigits)
    );

    setRealChartPoints((points) => [...points.slice(-29), next]);
    setRealDigitChartPoints((points) => [
  ...points.slice(-29),
  Number(next.toFixed(priceDigits).slice(-1))
]);

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
        const refreshedTrades = data.trades || [];
setTrades(refreshedTrades);

setActiveEvenOddTrade((current) => {
  if (!current) return null;

  const matchingTrade = refreshedTrades.find(
    (trade: any) => String(trade.id) === current.id
  );

  if (!matchingTrade) return current;

return matchingTrade.status === "PENDING" ? current : null;
});
      }
    } catch {
      console.log("Trades unavailable");
    }
  }
  async function loadRealTrades() {
  try {
    const response = await fetch("/api/real-trades", {
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load REAL trade history");
    }

    setRealTrades(data.trades || []);
    setRealTradesError("");
  } catch (error: any) {
    setRealTradesError(error.message || "REAL trade history unavailable");
  }
}

  useEffect(() => {
    const percentageInterval = setInterval(() => {
      setVolatilityPercentages(makeVolatilityPercentages());
    }, 15000);

    return () => clearInterval(percentageInterval);
  }, []);

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
  advanceRealSimulatedMarket();
}, 1000);
const interval = setInterval(() => {
  loadTrades();
loadWallet();
loadRealWallet();
loadWalletTransactions();
}, 1000);

return () => {
  clearInterval(marketInterval);
  clearInterval(interval);
};
  }, [asset, timeframe]);
 useEffect(() => {
  if (accountMode !== "REAL" || activeTab !== "POSITIONS") return;

  loadTrades();

  const realTradesInterval = setInterval(() => {
    loadRealTrades();
  }, 5000);

  return () => clearInterval(realTradesInterval);
}, [accountMode, activeTab]);

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
 function handleTradeButtonClick(
  selectedContract: string,
  selectedPrediction: string
) {
  // AUTO mode keeps its existing automatic trading cycle.
  if (tradeMode === "AUTO") {
    if (autoTradingRef.current) {
      if (
        autoContract === selectedContract &&
        autoPrediction === selectedPrediction
      ) {
        stopAutoTrading("AUTO trading stopped manually.");
      }
      return;
    }

    setAutoContract(selectedContract);
    setAutoPrediction(selectedPrediction);
    setContract(selectedContract);
    setPrediction(selectedPrediction);

    void runAutoTrading(selectedContract, selectedPrediction);
    return;
  }

  // MANUAL mode: identify the active position.
  const activeTrade =
    accountMode === "DEMO"
      ? trades.find(
          (trade: any) =>
            trade.status === "PENDING"
        )
      : realTrades.find(
          (trade: any) =>
            trade.status === "OPEN" &&
            trade.simulation_only === true
        );

  // Pressing the same button cashes out the position.
  if (
    activeTrade &&
    (
      accountMode === "DEMO"
        ? activeTrade.contract_type === selectedContract &&
          activeTrade.contract_prediction === selectedPrediction
        : activeTrade.contract_type === selectedContract &&
          activeTrade.direction === selectedPrediction
    )
  ) {
    void cashOutTrade(String(activeTrade.id));
    return;
  }

  // Do not open another position while one is active.
  if (activeTrade) {
    setMessage(
      "You already have an active trade. Press its yellow button to cash out."
    );
    return;
  }

  setContract(selectedContract);
  setPrediction(selectedPrediction);

  // Place one manual trade.
  void placeTrade(
    selectedContract,
    selectedPrediction,
    Number(amount),
    false
  );
}


function isAutoStopButton(
  selectedContract: string,
  selectedPrediction: string
) {
  return (
    autoTrading &&
    autoContract === selectedContract &&
    autoPrediction === selectedPrediction
  );
}
async function placeTrade(
  selectedContract: string = contract,
  selectedPrediction: string = prediction,
  selectedAmount: number = Number(amount),
  holdOpen: boolean = false
): Promise<string | null> {
  setMessage("");

  const stake = selectedAmount;

  if (
    !Number.isFinite(stake) ||
    stake < 1 ||
    stake > 100
  ) {
    setMessage("Stake must be between 1 and 100.");
    return null;
  }

  if (accountMode === "DEMO") {
    if (price === null) {
      setMessage("Market price unavailable.");
      return null;
    }

    if (walletBalance === null || stake > walletBalance) {
      setMessage("Insufficient virtual demo balance.");
      return null;
    }
  }
 

  setLoading(true);

  try {
    const isReal = accountMode === "REAL";

    const response = await fetch(
      isReal ? "/api/real-trades" : "/api/trades",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          isReal
            ? {
                action: "OPEN",
                asset,
                contractType: selectedContract,
                prediction: selectedPrediction,
                amount: stake,
                expirySeconds: holdOpen
                  ? 86400
                  : Number(expiry),
                selectedDigit:
                  selectedContract === "OVER_UNDER" ||
                  selectedContract === "MATCHES_DIFFERS"
                    ? Number(selectedDigit)
                    : null
              }
            : {
                asset,
                contractType: selectedContract,
                prediction: selectedPrediction,
                amount: stake,
                expirySeconds: holdOpen
                  ? 86400
                  : Number(expiry),
                targetPrice: null,
                selectedDigit:
                  selectedContract === "OVER_UNDER" ||
                  selectedContract === "MATCHES_DIFFERS"
                    ? Number(selectedDigit)
                    : null
              }
        )
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Trade failed.");
    }

    const tradeId = data.trade?.id;

    if (!tradeId) {
      throw new Error("Trade ID was not returned.");
    }

    if (isReal) {
      setRealTrades((current) => [
        data.trade,
        ...current.filter(
          (trade: any) =>
            String(trade.id) !== String(tradeId)
        )
      ]);

      await loadRealTrades();

      
    } else {
      if (selectedContract === "EVEN_ODD") {
        setActiveEvenOddTrade({
          id: String(tradeId),
          prediction: selectedPrediction
        });
      }

      setTrades((current) => [
        data.trade,
        ...current.filter(
          (trade) =>
            String(trade.id) !== String(tradeId)
        )
      ]);

      await loadWallet();

     
    }

    return String(tradeId);
  } catch (error: any) {
    setMessage(error.message || "Trade failed.");
    return null;
  } finally {
    setLoading(false);
  }
}

async function cashOutTrade(tradeId: string) {
  stopAutoTrading("AUTO trading stopped for cash out.");

  try {
    const isReal = accountMode === "REAL";

    const response = await fetch(
      isReal ? "/api/real-trades" : "/api/trades",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "CASH_OUT",
          tradeId
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Cash out failed.");
    }

    if (isReal) {
      await loadRealTrades();

      setMessage(
        data.message ||
        "Simulated position closed."
      );
    } else {
      await loadTrades();
      await loadWallet();
      await loadWalletTransactions();

     setMessage("");
    }
  } catch (error: any) {
    setMessage(error.message || "Cash out failed.");
  }
}
async function runAutoTrading(
  selectedContract: string = contract,
  selectedPrediction: string = prediction
) {
  if (accountMode === "REAL") {
  setAutoMessage("");
  return;
}
 
  if (autoTradingRef.current) return;

  const startingBalance = walletBalance;

  if (startingBalance === null) {
    setAutoMessage("Please wait for your demo wallet to load.");
    return;
  }
  const baseStake = Number(amount);
const multiplierValue = Number(multiplier);
const validatedStopLoss = Number(stopLoss);
const validatedProfitTarget = Number(profitTarget);
let currentStake = baseStake;

if (
  !Number.isFinite(baseStake) ||
  baseStake < 1 ||
  baseStake > 100 ||
  !Number.isInteger(multiplierValue) ||
  multiplierValue < 1 ||
  multiplierValue > 10 ||
  !Number.isFinite(validatedStopLoss) ||
  validatedStopLoss <= 0 ||
  !Number.isFinite(validatedProfitTarget) ||
  validatedProfitTarget <= 0
) {
  setAutoMessage("Invalid settings. Check investment, multiplier, stop loss and profit target.");
  return;
}

  autoStartBalanceRef.current = startingBalance;
  autoTradingRef.current = true;
  setAutoTrading(true);
  setAutoMessage("AUTO trading started.");

  try {
  while (autoTradingRef.current) {
    const placedTradeId = await placeTrade(selectedContract, selectedPrediction, currentStake, false);

    if (!placedTradeId) {
      stopAutoTrading("AUTO stopped because the trade could not be placed.");
      break;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Number(expiry) * 1000 + 500)
    );

    if (!autoTradingRef.current) break;

   let latestTrade = null;

for (let attempt = 0; attempt < 5; attempt++) {
  const tradesResponse = await fetch("/api/trades", {
    cache: "no-store"
  });

  if (!tradesResponse.ok) {
    stopAutoTrading("AUTO stopped: could not verify trade settlement.");
    break;
  }

  const tradesData = await tradesResponse.json();
  latestTrade = tradesData.trades?.find(
  (trade: any) => String(trade.id) === placedTradeId
) ?? null;

  if (latestTrade && latestTrade.status !== "PENDING") {
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (!autoTradingRef.current) break;

if (!latestTrade || latestTrade.status === "PENDING") {
  stopAutoTrading("AUTO stopped: previous trade could not be settled.");
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

if (!Number.isFinite(currentBalance) || currentBalance < 0) {
  stopAutoTrading("AUTO stopped: invalid demo wallet balance.");
  break;
}

const sessionProfit = currentBalance - startingBalance;
const lossLimit = validatedStopLoss;
const profitLimit = validatedProfitTarget;

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
    if (latestTrade.status === "WON") {
  currentStake = baseStake;
} else if (latestTrade.status === "LOST") {
  currentStake = Number((currentStake * multiplierValue).toFixed(2));
}

if (currentStake > 100) {
  stopAutoTrading("Multiplier reached the $100 trade limit.");
  break;
}

if (currentStake > currentBalance) {
  stopAutoTrading("Insufficient demo balance for the next multiplied trade.");
  break;
}

   if (currentBalance < Number(amount)) {
      stopAutoTrading("Insufficient demo balance. AUTO stopped.");
      break;
    }
  }
} catch (error) {
  stopAutoTrading(
    error instanceof Error
      ? `AUTO stopped: ${error.message}`
      : "AUTO stopped because of an unexpected error."
  );
}
}

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const pending = trades.filter(
    (trade) => trade.status === "PENDING"
  );
  const activeCashOutTrade =
  accountMode === "DEMO"
    ? pending[0] ?? null
    : realTrades.find(
        (trade: any) =>
          trade.status === "OPEN" &&
          trade.simulation_only === true
      ) ?? null;
const isPendingOption = (
  contractType: string,
  prediction: string
) => {
  if (accountMode === "REAL") {
    return realTrades.some(
      (trade: any) =>
        trade.simulation_only === true &&
        trade.status === "OPEN" &&
        trade.contract_type === contractType &&
        trade.direction === prediction
    );
  }

  return (
    (
      contractType === "EVEN_ODD" &&
      activeEvenOddTrade?.prediction === prediction
    ) ||
    pending.some(
      (trade) =>
        trade.contract_type === contractType &&
        trade.contract_prediction === prediction
    )
  );
};

  const settled = trades.filter(
    (trade) => trade.status !== "PENDING"
  );
  const latestTradeResult = settled[0] ?? null;

const latestResultAmount = latestTradeResult
 
  ? Number(
      latestTradeResult.status === "WON"
        ? latestTradeResult.simulated_result
        : latestTradeResult.amount
    )
  : 0;
   const recentTradeResults = settled
  .filter(
    (trade) =>
      trade.status === "WON" ||
      trade.status === "LOST"
  )
  .slice(0, 7);
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

const digitStats = (volatilityPercentages[asset] ?? []).map(
  (tenths, digit) => ({
    digit,
    percentage: tenths / 10
  })
);
  const highestDigitPercentage = Math.max(...digitStats.map((item) => item.percentage));
const lowestDigitPercentage = Math.min(...digitStats.map((item) => item.percentage));

const priceDigits = ASSETS.includes(asset)
  ? 7
  : asset === "USD/JPY"
    ? 3
    : ["EUR/USD", "GBP/USD"].includes(asset)
      ? 5
      : 2;

  const getLastPriceDigit = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return null;

    const formatted = value.toFixed(priceDigits);
    return Number(formatted.slice(-1));
  };

  const currentPriceDigit = getLastPriceDigit(
  accountMode === "REAL" ? realChartPrice : price
);
  const previousPriceDigit = getLastPriceDigit(previousPrice);

  const displayedChartPoints =
  accountMode === "REAL" ? realDigitChartPoints : digitChartPoints;

const displayedPrice =
  accountMode === "REAL" ? realChartPrice : price;

const displayedPreviousPrice =
  accountMode === "REAL"
    ? realChartPoints[realChartPoints.length - 2] ?? null
    : previousPrice;
 const chartMin = 0;
const chartMax = 9;
const chartRange = 9;
const displayedPriceDigit = getLastPriceDigit(displayedPrice);

const labelAnchorTick = 3;

const tickStep =
  chartRange / 6 ||
  Math.abs(displayedPrice ?? 0) * 0.00001 ||
  0.01;

const dynamicChartMin =
  displayedPrice !== null
    ? displayedPrice - labelAnchorTick * tickStep
    : chartMin;

const priceLabelValues = Array.from(
  { length: 7 },
  (_, tick) => dynamicChartMin + tickStep * tick
);
  const matchingTick =
  displayedPriceDigit !== null
    ? priceLabelValues.findIndex(
        value =>
          Number(value.toFixed(2).slice(-1)) === displayedPriceDigit
      )
    : -1;

const targetTick = matchingTick >= 0 ? matchingTick : 3;

const selectedPriceLabel = priceLabelValues[targetTick];
const selectedPriceLabelText = selectedPriceLabel.toFixed(2);
  const rightSideIndicatorDigit = Number(selectedPriceLabelText.slice(-1));
const targetY =
  targetTick !== null
    ? 205 - (targetTick / 6) * 180
    : null;
const dynamicChartRange = tickStep * 6;

const priceUp =
  displayedPreviousPrice !== null &&
  displayedPrice !== null &&
  displayedPrice >= displayedPreviousPrice;

const chartColor =
  displayedChartPoints.length > 1 &&
  displayedChartPoints[displayedChartPoints.length - 1] >= displayedChartPoints[0]
    ? accountMode === "REAL" ? "#f0b84b" : "#20d6a0"
    : "#f05b86";

const chartCoordinates = useMemo(() => {
  const points = displayedChartPoints.map((point, index) => ({
    x: (index / Math.max(displayedChartPoints.length - 1, 1)) * 650,
   y: 205 - ((point - chartMin) / chartRange) * 180,
  }));

  if (points.length < 2) return "";

  let path = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return path;
}, [displayedChartPoints, chartMin, chartRange]);
 
 function goTo(tab: string) {
  if (tab === "WALLET" && accountMode !== "REAL") {
    return;
  }

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
      ? realWalletError
        ? "NOT CONNECTED"
        : "Loading..."
      : `KES ${realWalletBalance.toFixed(2)}`}
</strong>
          </button>

          <div style={{ display: "flex", gap: "6px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
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

  <button
   onClick={() => {
  setAccountMode("DEMO");
  setActiveTab("TRADE");
}}
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
</div>
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


            <button onClick={() => {
  setMenuOpen(false);
  window.location.href = "/profile";
}}>
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

          </aside>
        </>
      )}

      {walletError && (
        <div className="error-banner">{walletError}</div>
      )}

      <div className="dashboard">
        {activeTab === "TRADE" && (
          <>
            <section className="chart-card trade-card">
              <div className="chart-content-scroll">
              <div
  style={{
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr 1fr",
    gap: "6px",
    alignItems: "center",
    width: "100%",
    minWidth: 0
  }}
>
  <div className="market-selector" style={{ minWidth: 0, gap: "4px" }}>
    <div style={{ minWidth: 0, width: "100%" }}>
      <small>SELECT MARKET</small>
      <select
        value={asset}
        onChange={(e) => setAsset(e.target.value)}
        style={{
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
          padding: "7px 4px",
          fontSize: "10px"
        }}
      >
        {ASSETS.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    </div>
  </div>

  <div
    className="contract-grid"
    style={{
      gridTemplateColumns: "1fr",
      minWidth: 0
    }}
  >
    <button
      className={contract === "EVEN_ODD" ? "contract active" : "contract"}
      onClick={() => setContract("EVEN_ODD")}
    >
      EVEN / ODD
    </button>
  </div>

  <div
    className="contract-grid"
    style={{
      gridTemplateColumns: "1fr",
      minWidth: 0
    }}
  >
    <button
      className={contract === "OVER_UNDER" ? "contract active" : "contract"}
      onClick={() => setContract("OVER_UNDER")}
    >
      OVER / UNDER
    </button>
  </div>
</div>
                       
              <div className="chart">
                {displayedChartPoints.length > 1 ? (
                  <svg
  className="chart-svg"
  viewBox="0 0 700 260"
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
                       x2="650"
                        y2={y}
                        stroke="#263448"
                        strokeDasharray="4 6"
                      />
                    ))}

                      <path
  d={`${chartCoordinates} L 650,220 L 0,220 Z`}
  fill="url(#chartFill)"
/>

<path
  d={chartCoordinates}
  fill="none"
 stroke={chartColor}
  strokeWidth="3"
  strokeLinecap="round"
  strokeLinejoin="round"
  style={{
    filter: `drop-shadow(0 0 5px ${chartColor})`,
  }}
/>
                   
 {displayedChartPoints.length > 0 && (
  <circle
    cx="650"
    cy={
      205 -
      ((displayedChartPoints[displayedChartPoints.length - 1] - chartMin) /
        chartRange) *
        180
    }
    r="4"
    fill={chartColor}
    style={{
    filter: `drop-shadow(0 0 5px ${chartColor}) drop-shadow(0 0 10px ${chartColor})`,
    }}
  />
)}
                    {displayedChartPoints.length > 0 && (
  <g
    transform={`translate(565, ${
      205 -
      ((displayedChartPoints[displayedChartPoints.length - 1] - chartMin) /
        chartRange) *
        180
    })`}
  >
    <rect
      x="0"
      y="-23"
      width="80"
      height="18"
      rx="4"
      fill="#111827"
      stroke={chartColor}
      strokeWidth="1"
    />
    <text
      x="40"
      y="-10"
      textAnchor="middle"
      fill={chartColor}
      fontSize="10"
      fontWeight="700"
    >
      {selectedPriceLabelText}
    </text>
  </g>
)}
     
                  {priceLabelValues.map((value, tick) => (
  <text
    key={tick}
    x="660"
    y={205 - (tick / 6) * 180 + 4}
    fill="#9aabc0"
    fontSize="11"
  >
    {value.toFixed(2)}
  </text>
))}
                    {Array.from({ length: 8 }, (_, index) => (
  <text
    key={index}
    x={(index / 7) * 650}
    y="247"
    fill="#9aabc0"
    fontSize="11"
    textAnchor={
      index === 0 ? "start" : index === 7 ? "end" : "middle"
    }
  >
    {index === 7 ? "NOW" : `${7 - index}s`}
  </text>
))}
                    <g>
  <rect
    x="8"
    y="215"
    width="92"
    height="23"
    rx="5"
    fill="#111827"
    opacity="0.9"
  />
  <text
    x="54"
    y="231"
    textAnchor="middle"
    fill="#ffffff"
    fontSize="12"
    fontWeight="700"
  >
   
  </text>
</g>
                  </svg>
                ) : (
                  <div className="chart-loading">
                    <div className="loader" />
                    {marketLoading
                      ? "LOADING MARKET DATA"
                      : "CHART DATA UNAVAILABLE"}
                  </div>
                )}
                <div className="chart-clock">{chartClock}</div>
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
  {digitStats.map(({ digit, percentage }) => (
    <div
      key={digit}
      title={`${digit}: ${percentage.toFixed(1)}%`}
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
          background: `conic-gradient(${percentage === highestDigitPercentage ? "#22c55e" : percentage === lowestDigitPercentage ? "#ef4444" : digit % 2 === 0 ? "#a78bfa" : "#38bdf8"} ${percentage}%, rgba(148,163,184,.18) 0)`,
boxShadow: percentage === highestDigitPercentage
  ? "0 0 8px rgba(34,197,94,.9), 0 0 18px rgba(34,197,94,.75), 0 0 30px rgba(34,197,94,.5)"
  : percentage === lowestDigitPercentage
    ? "0 0 8px rgba(239,68,68,.9), 0 0 18px rgba(239,68,68,.75), 0 0 30px rgba(239,68,68,.5)"
    : "none"
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
          {rightSideIndicatorDigit === digit && (
  <span
    title={`Selected chart price: ${selectedPriceLabelText}`}
    style={{
      position: "absolute",
      top: "2px",
      right: "2px",
      width: "7px",
      height: "7px",
      borderRadius: "50%",
      background: "#fbbf24",
      boxShadow: "0 0 7px #fbbf24",
      zIndex: 5
    }}
  />
)}
          <span style={{
  fontSize: "8px",
  fontWeight: 700,
  color: "#cbd5e1",
  lineHeight: 1
}}>
  {percentage.toFixed(1)}%
</span>

 
   
</div>
        
      </div> 
  
    </div>
  ))}
</div>
              </section>
                </div>      
           

              <div className="direction-grid">
  <button
    className={tradeMode === "AUTO" ? "direction active" : "direction"}
    onClick={() => setTradeMode("AUTO")}
  >
    AUTO 
  </button>

  <button
    className={tradeMode === "MANUAL" ? "direction active" : "direction"}
    onClick={() => setTradeMode("MANUAL")}
  >
    MANUAL
  </button>
</div>
             {tradeMode === "AUTO" && (
  <div
    className="auto-controls"
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "8px",
      margin: "12px 0"
    }}
  >
     <div className="target-profit-control">
      <label>Target Profit ($)</label>
      <input
        type="number"
        min="1"
        value={profitTarget}
        onChange={(e) => setProfitTarget(e.target.value)}
        placeholder="Target"
        disabled={autoTrading}
      />
    </div>

    <div className="stop-loss-control">
      <label>Stop Loss ($)</label>
      <input
        type="number"
        min="1"
        value={stopLoss}
        onChange={(e) => setStopLoss(e.target.value)}
        placeholder="Stop"
        disabled={autoTrading}
      />
    </div>

     <div className="multiplier-control">
      <label>Multiplier</label>
      <input
        type="number"
        min="1"
        max="10"
        step="1"
        value={multiplier}
        onChange={(e) => setMultiplier(e.target.value)}
        placeholder="Multiplier"
        disabled={autoTrading}
      />
    </div>
  </div>
)}
                

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
              {contract === "EVEN_ODD" && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      background: "#111827",
      border: "1px solid #263449",
      borderRadius: "6px",
      padding: "3px 6px",
      marginBottom: "7px",
      minHeight: "22px",
      width: "100%",
      boxSizing: "border-box"
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
      {recentTradeResults.map((trade: any) => (
        <span
          key={trade.id}
          style={{
            fontSize: "9px",
            lineHeight: 1,
            fontWeight: 900,
            color: trade.status === "WON" ? "#34d9a3" : "#fb668b"
          }}
        >
          {trade.status === "WON" ? "W" : "L"}
        </span>
      ))}
    </div>

    <div
      style={{
        flexShrink: 0,
        fontSize: "10px",
        lineHeight: 1,
        fontWeight: 800,
        color:
          latestTradeResult?.status === "WON"
            ? "#34d9a3"
            : latestTradeResult?.status === "LOST"
              ? "#fb668b"
              : "transparent"
      }}
    >
      {latestTradeResult?.status === "WON"
        ? `+$${latestResultAmount.toFixed(2)}`
        : latestTradeResult?.status === "LOST"
          ? `-$${latestResultAmount.toFixed(2)}`
          : ""}
    </div>
  </div>
)}
              {activeCashOutTrade ? (
  <div className="direction-grid even-odd-grid">
    <button
      type="button"
      className="direction cash-out-button"
      style={{
        gridColumn: "1 / -1",
        background: "linear-gradient(100deg, #d6b56d, #8f6b2e)",
        border: "1px solid #f0cf82",
        color: "#111827",
        minHeight: "48px",
        fontWeight: 900
      }}
      onClick={() => void cashOutTrade(String(activeCashOutTrade.id))}
      disabled={loading}
    >
      CASH OUT
      <small>Close your active trade</small>
    </button>
  </div>
) : (
            <>
                                    
              {contract === "EVEN_ODD" && (
                <>
               

                  <div className="direction-grid even-odd-grid">
                   <button
  className={
    isAutoStopButton("EVEN_ODD", "EVEN")
      ? "direction even auto-stop"
      : isPendingOption("EVEN_ODD", "EVEN")
        ? "direction even pending"
        : "direction even"
  }
  onClick={() => handleTradeButtonClick("EVEN_ODD", "EVEN")}
 disabled={loading && !autoTrading}
>
  EVEN
  <small>${(Number(amount || 0) * 1.8).toFixed(2)}</small>
</button>

                   <button
  className={
    isAutoStopButton("EVEN_ODD", "ODD")
      ? "direction odd auto-stop"
      : isPendingOption("EVEN_ODD", "ODD")
        ? "direction odd pending"
        : "direction odd"
  }
  onClick={() => handleTradeButtonClick("EVEN_ODD", "ODD")}
 disabled={loading && !autoTrading}
>
  ODD
  <small>${(Number(amount || 0) * 1.8).toFixed(2)}</small>
</button>
                  </div>
                </>
              )}

              {contract === "OVER_UNDER" && (
  <div className="over-under-panel">
    <label>Prediction</label>

    <div className="direction-grid">
    <button
  className={
  isAutoStopButton("OVER_UNDER", "OVER")
    ? "direction over auto-stop"
    : isPendingOption("OVER_UNDER", "OVER")
      ? "direction over pending"
      : "direction over"
}
  onClick={() => handleTradeButtonClick("OVER_UNDER", "OVER")}
  disabled={loading && !autoTrading}
>
  OVER
  <small>Above selected digit</small>
</button>
      <button
  className={
  isAutoStopButton("OVER_UNDER", "UNDER")
    ? "direction under auto-stop"
    : isPendingOption("OVER_UNDER", "UNDER")
      ? "direction under pending"
      : "direction under"
}
  onClick={() => handleTradeButtonClick("OVER_UNDER", "UNDER")}
  disabled={loading && !autoTrading}
>
  UNDER
  <small>Below selected digit</small>
</button>
    </div>

    <div className="ou-settings-grid">
      <div>
       <div>
  <label>Choose digit (0–9)</label>
  <div className="digit-grid">
    {[0,1,2,3,4,5,6,7,8,9].map((digit) => (
      <button
        key={digit}
        type="button"
        className={selectedDigit === String(digit) ? "digit active" : "digit"}
        onClick={() => setSelectedDigit(String(digit))}
      >
        {digit}
      </button>
    ))}
  </div>
</div>
      </div>

      <div>
        <label>Duration</label>
        <select
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
        >
          <option value="5">5 seconds</option>
          <option value="10">10 seconds</option>
          <option value="15">15 seconds</option>
          <option value="30">30 seconds</option>
          <option value="60">1 minute</option>
        </select>
      </div>
    </div>

    <div className="ou-payout">
      Estimated payout: 
      <strong>
        ${(Number(amount || 0) * 1.8).toFixed(2)}
      </strong>
    </div>

    <div className="ou-results">
      <label>LAST 5 OVER / UNDER RESULTS</label>

      <div className="ou-results-row">
        {trades
          .filter((trade) =>
            trade.contract_type === "OVER_UNDER" &&
            trade.status !== "PENDING"
          )
          .slice(0, 5)
          .map((trade) => (
            <span
              key={trade.id}
              className={
                trade.status === "WON" ? "ou-won" : "ou-lost"
              }
            >
              {trade.status === "WON" ? "WON" :
               trade.status === "LOST" ? "LOST" : "REF"}
            </span>
          ))}
      </div>
    </div>
  </div>
)}
              {contract === "MATCHES_DIFFERS" && (
                <>
                
                </>
              )}
              </>
)}
                               
             {tradeMode === "AUTO" && (
  <div className="auto-controls">
    <p>{autoMessage}</p>
  </div>
)}
                                     

              {message && (
                <div className="trade-message">{message}</div>
              )}

              
            </section>
          </>
        )}

        {activeTab === "AI" && (
  <section className="placeholder-card">
    <div className="ai-icon">✦</div>
    <span className="section-label">AUREVEX INTELLIGENCE ENGINE</span>
    <h2>VOLATILITY DEEP SCANNER</h2>

    <p>
 
</p>

   <button
  className="primary-button"
  onClick={runVolatilityScan}
  style={{ width: "100%", margin: "12px 0" }}
>
  {scanLoading ? "STOP DEEP SCAN" : "✦ RUN DEEP SCAN"}
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
              gridTemplateColumns: "1fr",
              gap: "12px",
              marginTop: "16px"
            }}
          >
           
            <div>
              <small>ANALYSIS QUALITY</small>
              <h3>{scanResults[0].quality}%</h3>
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

      </>
    )}

  </section>
)}
        {activeTab === "POSITIONS" && (
          <section className="positions-card">
            <span className="section-label">YOUR ACTIVITY</span>
            <h2>Open Positions</h2>
            {accountMode === "REAL" && (
  <>
    <h2>REAL Open Positions</h2>

    {realTradesError && (
      <p className="empty-state">{realTradesError}</p>
    )}

    {realTrades.filter((trade) => trade.status === "OPEN").length === 0 && (
      <p className="empty-state">No open REAL test trades.</p>
    )}

    {realTrades
      .filter((trade) => trade.status === "OPEN")
      .map((trade) => (
        <div className="trade-row" key={trade.id}>
          <div>
            <strong>{trade.asset}</strong>
            <small>{trade.contract_type} · {trade.direction}</small>
          </div>
          <div>
            <strong>KES {Number(trade.amount).toFixed(2)}</strong>
            <small>{trade.expiry_seconds} seconds</small>
          </div>
         <button
  className="direction even pending"
  onClick={() => cashOutTrade(String(trade.id))}
  disabled={loading}
>
  CASH OUT
</button>
        </div>
      ))}

    <h2 className="history-title">REAL Trade History</h2>

    {realTrades.filter((trade) => trade.status !== "OPEN").length === 0 && (
      <p className="empty-state">No completed REAL test trades.</p>
    )}

    {realTrades
      .filter((trade) => trade.status !== "OPEN")
      .map((trade) => (
        <div className="trade-row" key={trade.id}>
          <div>
            <strong>{trade.asset}</strong>
            <small>{trade.contract_type} · {trade.direction}</small>
          </div>
          <div>
            <strong>KES {Number(trade.amount).toFixed(2)}</strong>
            <small>
  {trade.status === "CASHED_OUT"
    ? `Cash out: KES ${Number(trade.cash_out_amount ?? 0).toFixed(2)} · Net: KES ${Number(trade.net_result ?? 0).toFixed(2)}`
    : "Simulated record — no real payout"}
</small>
          </div>
          <span className={trade.status === "WON" ? "won" : trade.status === "LOST" ? "lost" : "pending"}>
            {trade.status}
          </span>
        </div>
      ))}
  </>
)}

            {accountMode === "DEMO" && (
  <>
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

    <button
      className="direction even pending"
      onClick={() => cashOutTrade(String(trade.id))}
      disabled={loading}
    >
      CASH OUT
    </button>
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

      {trade.contract_type === "OVER_UNDER" && (
        <small>
          Selected: {trade.entry_digit ?? "—"} ·
          Expiry: {trade.expiry_digit ?? "—"}
        </small>
      )}
    </div>

    <div>
      <strong>
       {trade.status === "WON"
  ? `+$${trade.simulated_result}`
  : trade.status === "LOST"
    ? `-$${trade.amount}`
    : trade.status === "CASHED_OUT"
      ? `${Number(trade.simulated_result) >= 0 ? "+" : "-"}$${Math.abs(Number(trade.simulated_result)).toFixed(2)} cash out`
      : "Refund"}
      </strong>
    </div>

   <span className={
  trade.status === "WON"
    ? "won"
    : trade.status === "LOST"
      ? "lost"
      : trade.status === "CASHED_OUT"
        ? Number(trade.simulated_result) > 0
          ? "won"
          : Number(trade.simulated_result) < 0
            ? "lost"
            : "pending"
        : "pending"
}>
  {trade.status}
</span>
  </div>
))}
    </>
)}
               
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
              min="5"
              max="5000"
              step="0.01"
              value={walletActionAmount}
              onChange={(e) => setWalletActionAmount(e.target.value)}
              placeholder="Enter amount"
            />

            <button
              className="trade-submit"
              disabled
              onClick={() => submitWalletAction("DEPOSIT")}
            >
              {walletActionLoading ? "PROCESSING..." : "ADD DEMO FUNDS"}
            </button>

            <button
              className="trade-submit"
              disabled
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
                  ? realWalletError || "Loading..."
                  : `KES ${realWalletBalance.toFixed(2)}`}
              </strong>
              <span>KES · TEST ACCOUNT</span>
            </div>

            <div className="notice-card">
              <strong>Payment services unavailable</strong>
              <p>
                Your wallet is currently in TEST mode.
                PalPluss deposits and withdrawals are disabled.
                No live payment or payout can be made through this screen.
              </p>
            </div>

            <h3>Wallet services</h3>

            <button
              className="trade-submit"
              disabled
            >
              DEPOSITS UNAVAILABLE
            </button>

            <button
              className="trade-submit"
              disabled
            >
              WITHDRAWALS UNAVAILABLE
            </button>

            <div className="notice-card">
              <strong>PalPluss status</strong>
              <p>
                Provider integration configured.
                Live deposit processing is disabled.
                Withdrawal processing is disabled.
              </p>
            </div>
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
            <h2>AUREVEX AI Assistant</h2>

            <div
              style={{
                background: "#080f1c",
                border: "1px solid #263449",
                borderRadius: "16px",
                overflow: "hidden",
                marginTop: "16px"
              }}
            >
              <div
                style={{
                  padding: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderBottom: "1px solid #263449"
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "#123b35",
                    color: "#42e6b0",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "20px"
                  }}
                >
                  ✦
                </div>

                <div>
                  <strong>AUREVEX AI</strong>
                  <div style={{ color: "#42e6b0", fontSize: "12px" }}>
                    Assistant preview
                  </div>
                </div>
              </div>

              <div style={{ padding: "18px", minHeight: "230px" }}>
                <div
                  style={{
                    display: "inline-block",
                    maxWidth: "90%",
                    background: "#172438",
                    border: "1px solid #2b3d55",
                    borderRadius: "14px",
                    padding: "14px",
                    color: "#e5edf8",
                    lineHeight: "1.6",
                    fontSize: "14px"
                  }}
                >
                  Hello! Welcome to AUREVEX. 👋

                  <br /><br />

                  I'm your AUREVEX AI Assistant. I'm here to help you
                  understand the platform and explore its features .

                  <br /><br />

                  How can I help you today?
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  padding: "12px",
                  borderTop: "1px solid #263449"
                }}
              >
                <input
                  type="text"
                  placeholder="Message AUREVEX AI..."
                  disabled
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: "10px",
                    padding: "12px",
                    background: "#111c2c",
                    color: "#9aa9bd",
                    border: "1px solid #263449"
                  }}
                />

                <button
                  type="button"
                  disabled
                  style={{
                    border: 0,
                    borderRadius: "10px",
                    padding: "0 16px",
                    background: "#167b65",
                    color: "#ffffff",
                    fontWeight: 700,
                    opacity: 0.65
                  }}
                >
                  Send
                </button>
              </div>
            </div>

            <p style={{ color: "#8795a9", fontSize: "12px", marginTop: "12px" }}>
              AI Assistant preview.
            </p>
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

 

      <style jsx>{`
       
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
  background: #0b0e13;
  border-bottom: 1px solid #5c4b27;
}

        .market-selector { display: flex; align-items: center; gap: 12px; }

       .market-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  background: #292414;
  color: #d6b56d;
  border: 1px solid #5c4b27;
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
  color: #e5c477;
  background: #111318;
  border: 1px solid #5c4b27;
  border-radius: 7px;
  padding: 7px 10px;
  outline: 0;
  font-weight: 800;
  cursor: pointer;
}

        .market-selector option { color: #111827; }
        .market-price strong {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
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
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

        .chart-card, .trade-card, .positions-card, .page-card, .placeholder-card {
  background: #0d1016;
  border: 1px solid #3b3220;
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
  color: #d6b56d;
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

        .timeframes button.selected {
  background: #292414;
  color: #f5d98f;
  border: 1px solid #d6b56d;
  box-shadow: 0 0 10px #d6b56d22;
}

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

        .chart-price-row strong {
  font-size: 29px;
  font-weight: 900;
  color: #f5d98f;
  letter-spacing: 0.5px;
}

       .chart-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px;
  background: #0b0e13;
  border: 1px solid #5c4b27;
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
  background: #111318;
  border: 1px solid #5c4b27;
  color: #e5c477;
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 10px;
}
.toolbar-group button:hover {
  background: #292414;
  border-color: #d6b56d;
  color: #f5d98f;
}
        .toolbar-group strong { font-size: 10px; }
        .chart-clock {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 5;
  padding: 5px 9px;
  border-radius: 5px;
  background: rgba(17, 24, 39, 0.9);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
}

        .chart {
        position: relative;
          width: 100%;
          height: 300px;
          margin-top: 15px;
          background: #0b1524;
          border-radius: 9px;
          overflow: hidden;
        }

        .chart svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

        .chart-loading {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 15px;
          color: #d6b56d;
          font-size: 11px;
          letter-spacing: 1px;
        }

        .loader {
  width: 25px;
  height: 25px;
  border: 3px solid #3b3220;
  border-top-color: #d6b56d;
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
  border: 1px solid #5c4b27;
  background: #111318;
  color: #d0c5a6;
  border-radius: 8px;
  padding: 12px 8px;
  font-size: 10px;
  font-weight: 800;
  transition: .2s;
}

        .contract.active, .direction.active, .quick.active, .digit.active {
  border-color: #d6b56d;
  background: #292414;
  color: #f5d98f;
  box-shadow: 0 0 12px #d6b56d33;
}
.direction.even,
.direction.over,
.direction.matches {
  background: #123e35;
  border-color: #29c99a;
  color: #54e5b4;
}

.direction.odd,
.direction.under,
.direction.differs {
  background: #421d30;
  border-color: #ed5b84;
  color: #ff83a2;
}
.direction.pending {
  background: #493b12;
  border-color: #f5c542;
  color: #ffe27a;
  box-shadow: 0 0 14px #f5c54266;
}

      .direction-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.direction-grid button {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
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
            margin: 4px auto;
            padding: 0 10px;
            gap: 4px;
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
  z-index: 100;
  bottom: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  gap: 0;
  padding: 8px 5px calc(8px + env(safe-area-inset-bottom));
  background: #111b2b;
  border-top: 1px solid #34435a;
}

.dashboard {
  padding-bottom: 100px;
}

.nav-item {
  width: 100%;
  min-width: 0;
  white-space: nowrap;
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
    linear-gradient(#d6b56d12 1px, transparent 1px),
    linear-gradient(90deg, #d6b56d12 1px, transparent 1px),
    #090b0f;
  background-size: 35px 35px;
  border: 1px solid #5c4b27;
  border-radius: 10px;
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
  min-height: 52px;
  background: linear-gradient(100deg, #d6b56d, #8f6b2e);
  color: #090909;
  border: 1px solid #e5c477;
  border-radius: 9px;
  font-weight: 900;
  letter-spacing: 1px;
  box-shadow: 0 4px 18px #d6b56d22;
  cursor: pointer;
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
.even-odd-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.even-odd-grid button {
  width: 100%;
  min-width: 0;
  min-height: 58px;
  padding: 8px 5px;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 1px;
  border-radius: 10px;
  box-sizing: border-box;
}
.even-odd-grid .even {
  background: #123d2b;
  border: 1px solid #20c878;
  color: #20e58a;
}

.even-odd-grid .odd {
  background: #481b25;
  border: 1px solid #e0445e;
  color: #ff526b;
}

.even-odd-grid .even.active {
  background: #087a43;
  border-color: #20e58a;
  color: #ffffff;
  box-shadow: 0 0 18px #20e58a55;
}

.even-odd-grid .odd.active {
  background: #b51f3b;
  border-color: #ff526b;
  color: #ffffff;
  box-shadow: 0 0 18px #ff526b55;
}
.even-odd-grid .direction.pending,
.even-odd-grid .direction.even.pending,
.even-odd-grid .direction.odd.pending {
  background: #ffd700 !important;
  border: 2px solid #fff0a3 !important;
  color: #171000 !important;
  box-shadow: 0 0 22px #ffd700aa !important;
}
.direction.auto-stop {
  background: #ffd700 !important;
  border: 2px solid #fff0a3 !important;
  color: #171000 !important;
  box-shadow: 0 0 22px #ffd700aa !important;
}
/* MATCHES / DIFFERS */
.direction.matches {
  background: #123d2b;
  border: 1px solid #20c878;
  color: #20e58a;
}

.direction.matches.active {
  background: #087a43;
  border-color: #20e58a;
  color: #ffffff;
  box-shadow: 0 0 18px #20e58a55;
}

.direction.differs {
  background: #481b25;
  border: 1px solid #e0445e;
  color: #ff526b;
}

.direction.differs.active {
  background: #b51f3b;
  border-color: #ff526b;
  color: #ffffff;
  box-shadow: 0 0 18px #ff526b55;
}

/* OVER / UNDER */
.direction.over {
  background: #123d2b;
  border: 1px solid #20c878;
  color: #20e58a;
}

.direction.over.active {
  background: #087a43;
  border-color: #20e58a;
  color: #ffffff;
  box-shadow: 0 0 18px #20e58a55;
}

.direction.under {
  background: #481b25;
  border: 1px solid #e0445e;
  color: #ff526b;
}

.direction.under.active {
  background: #b51f3b;
  border-color: #ff526b;
  color: #ffffff;
  box-shadow: 0 0 18px #ff526b55;
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
/* AUREVEX SINGLE-SCREEN DASHBOARD */
.dashboard {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, .8fr);
  align-items: start;
  gap: 10px;
  margin: 0px auto;
}

.chart-card {
  grid-column: 1 / -1;
  width: 100%;
  padding: 10px;
}
.trade-card {
  grid-column: 2;
  padding: 10px;
  min-width: 0;
}
.chart-card.trade-card {
  grid-column: 1 / -1;
  width: 100%;
  min-width: 0;
}

.chart {
  height: 420px;
  margin-top: 8px;
  transform: translateY(-2px);
}

.chart-card > section {
  margin: 7px 0 !important;
  padding: 7px !important;
}

.contract {
  min-height: 34px;
  padding: 5px;
}

.trade-card label {
  margin: 5px 0 3px;
}

.direction {
  padding: 8px 4px;
}

.quick-amounts {
  gap: 4px;
}

.advanced-controls {
  padding: 7px;
  margin-top: 7px;
}

@media (max-width: 600px) {
.aurevex {
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    padding-bottom: 0;
  }
.dashboard {
  width: 100%;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
 padding: 0 6px 70px;
margin: 0 auto;
}

.chart {
  height: 220px;
  margin-top: 2px;
}
  .chart-card,
.trade-card {
  grid-column: 1;
  width: 100%;
  padding: 8px;
  min-width: 0;
}

.chart {
  height: 150px;
  min-height: 140px;
}

  .chart-card > section {
    margin: 5px 0 !important;
    padding: 5px !important;
  }

  .chart-card h2,
  .trade-card h2 {
    font-size: 13px;
  }

  .chart-card .contract {
    font-size: 7px;
    min-height: 28px;
  }

  .trade-card label {
    font-size: 8px;
    margin: 5px 0 3px;
  }

  .trade-card input {
    min-width: 0;
    width: 100%;
    padding: 6px 3px;
    font-size: 10px;
  }

  .quick-amounts button,
  .direction {
    font-size: 8px;
    padding: 7px 2px;
  }

  .three-fields {
    gap: 3px;
  }

  .three-fields input {
    font-size: 9px;
    padding: 5px 2px;
  }

  .preview-note {
    font-size: 7px;
  }
}
/* AUREVEX MOBILE FIXED LAYOUT */
@media (max-width: 600px) {
  :global(html),
  :global(body) {
    height: auto;
    min-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
  }

 .aurevex {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
    display: block;
    padding-bottom: 85px;
}

.chart-card.trade-card {
    min-height: auto;
    height: auto;
    max-height: none;
    overflow: visible;
}

  .chart-card.trade-card {
    min-height: 0;
   height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
/* COMPACT OVER / UNDER SECTION */
.direction-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
  margin: 4px 0;
}

.direction-grid button {
  min-height: 38px !important;
  height: 38px !important;
  padding: 4px 6px !important;
  font-size: 12px !important;
  border-radius: 6px !important;
}

.direction-grid button small {
  display: block;
  font-size: 9px !important;
  margin-top: 2px;
}

.trade-card label {
  display: block;
  margin: 4px 0 3px !important;
  font-size: 10px !important;
}

.trade-card input {
  min-height: 32px !important;
  height: 32px !important;
  padding: 4px 8px !important;
  font-size: 12px !important;
}

.trade-card .direction-grid + label {
  margin-top: 4px !important;
}
/* OVER UNDER COMPACT SETTINGS */
.over-under-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
}

.ou-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.ou-settings-grid input,
.ou-settings-grid select {
  width: 100%;
  height: 32px;
  min-height: 32px;
  box-sizing: border-box;
  font-size: 11px;
  padding: 4px 6px;
}

.ou-payout {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 5px 7px;
  background: #111827;
  border-radius: 5px;
}

.ou-results label {
  font-size: 9px;
}

.ou-results-row {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.ou-results-row span {
  font-size: 9px;
  padding: 4px 7px;
  border-radius: 4px;
  background: #1b2637;
}

.ou-won {
  color: #34d399;
}

.ou-lost {
  color: #fb7185;
}
/* AUREVEX FULL MOBILE RESPONSIVE MODE */
@media (max-width: 600px) {
  * {
    box-sizing: border-box;
  }

  html,
  body {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

 .aurevex {
  width: 100%;
  max-width: 100%;
  height: 100dvh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0;
}

  .topbar,
  .market-strip {
    width: 100%;
    max-width: 100%;
  }

  .dashboard {
  flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
    padding: 0 8px 90px;
    gap: 10px;
  }

  .chart-card,
  .trade-card,
  .positions-card,
  .page-card,
  .placeholder-card {
    grid-column: 1;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    padding: 9px;
  }
.chart-content-scroll {
  width: 100%;
  max-height: 68dvh;
  overflow-y: auto;
  overflow-x: hidden;
  touch-action: pan-y;
overscroll-behavior-x: none;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.chart-content-scroll::-webkit-scrollbar {
  display: none;
}
  .chart {
    position: relative;
    width: 100%;
    height: clamp(180px, 55vw, 280px);
    min-height: 180px;
    max-height: 280px;
    overflow: hidden;
  }

  .chart svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .chart-toolbar,
  .card-heading,
  .chart-price-row {
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    gap: 8px;
  }

  .trade-card {
    position: static;
  }

  input,
  select,
  button {
    max-width: 100%;
  }

  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    padding-bottom: calc(8px + env(safe-area-inset-bottom));
  }
}
.aurevex .trade-card .amount-input input {
  font-size: 16px !important;
  -webkit-text-size-adjust: 100%;
}
/* LOCK PAGE — SCROLL DASHBOARD CONTENT ONLY */
@media (max-width: 600px) {
  html,
  body {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden !important;
  }

  .aurevex {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: 0;
  }

  .topbar {
    position: relative;
    top: auto;
    flex: 0 0 72px;
    height: 72px;
    z-index: 100;
  }

  .dashboard {
    flex: 1 1 auto;
    min-height: 0;
    height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
}
/* RESPONSIVE CHART — FIT BETWEEN HEADER AND FOOTER */
@media (max-width: 600px) {
  .dashboard:has(.chart-card.trade-card) {
  margin-top: -38px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 6px calc(68px + env(safe-area-inset-bottom));
    overflow-y: hidden;
    overflow-x: hidden;
  }

  .chart-card.trade-card {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    padding: 7px;
  }

  .chart-content-scroll {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    max-height: none;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .chart {
    height: clamp(130px, 24dvh, 250px);
    min-height: 130px;
    max-height: 250px;
  }
}
/* AUTO CONTROL COLORS */
.auto-controls .target-profit-control label,
.auto-controls .target-profit-control input {
  color: #22c55e;
}

.auto-controls .stop-loss-control label,
.auto-controls .stop-loss-control input {
  color: #ef4444;
}

.auto-controls .multiplier-control label,
.auto-controls .multiplier-control input {
  color: #facc15;
}
      `}</style>
    </main>
  );
}
