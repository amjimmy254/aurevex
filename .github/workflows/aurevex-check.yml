const DERIV_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const REQUEST_TIMEOUT_MS = 15000;
const HISTORY_COUNT = 100;

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Deriv connection timed out."));
    }, REQUEST_TIMEOUT_MS);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );

    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Could not connect to Deriv."));
      },
      { once: true }
    );
  });
}

function sendRequest(socket, payload, expectedType) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Timed out waiting for ${expectedType}.`)
      );
    }, REQUEST_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
    }

    function onMessage(event) {
      let response;

      try {
        response = JSON.parse(String(event.data));
      } catch {
        cleanup();
        reject(new Error("Deriv returned invalid JSON."));
        return;
      }

      if (response.error) {
        cleanup();
        reject(
          new Error(
            response.error.message || "Deriv API error."
          )
        );
        return;
      }

      if (response.msg_type === expectedType) {
        cleanup();
        resolve(response);
      }
    }

    socket.addEventListener("message", onMessage);

    try {
      socket.send(JSON.stringify(payload));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function main() {
  if (typeof WebSocket === "undefined") {
    throw new Error(
      "This test requires Node.js with built-in WebSocket support."
    );
  }

  const socket = new WebSocket(DERIV_WS);

  try {
    await waitForOpen(socket);

    console.log("PASS: Connected to Deriv public WebSocket.");

    const symbolsResponse = await sendRequest(
      socket,
      {
        active_symbols: "full",
        req_id: 9101,
      },
      "active_symbols"
    );

    const symbols = symbolsResponse.active_symbols;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      throw new Error("Deriv returned no active symbols.");
    }

    console.log(
      `PASS: Received ${symbols.length} active symbols.`
    );

    const volatilityMarkets = symbols
      .map((item) => ({
        symbol:
          item.underlying_symbol ?? item.symbol,
        name:
          item.underlying_symbol_name ??
          item.display_name,
        pipSize:
          item.pip_size ?? item.pip,
      }))
      .filter(
        (item) =>
          typeof item.symbol === "string" &&
          typeof item.name === "string" &&
          item.name.toLowerCase().includes("volatility")
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    if (volatilityMarkets.length === 0) {
      throw new Error(
        "No active Volatility Index symbols were found."
      );
    }

    console.log(
      `PASS: Found ${volatilityMarkets.length} Volatility Index markets.`
    );

    const selected = volatilityMarkets[0];

    console.log(
      `Selected market: ${selected.name} (${selected.symbol})`
    );

    console.log(
      `Provider precision metadata: ${selected.pipSize}`
    );

    if (
      typeof selected.pipSize !== "number" ||
      !Number.isFinite(selected.pipSize) ||
      selected.pipSize <= 0
    ) {
      throw new Error(
        "Selected market has invalid precision metadata."
      );
    }

    const historyResponse = await sendRequest(
      socket,
      {
        ticks_history: selected.symbol,
        count: HISTORY_COUNT,
        end: "latest",
        style: "ticks",
        req_id: 9102,
      },
      "history"
    );

    const prices = historyResponse.history?.prices;
    const times = historyResponse.history?.times;

    if (
      !Array.isArray(prices) ||
      prices.length === 0 ||
      !Array.isArray(times) ||
      times.length === 0
    ) {
      throw new Error(
        "Deriv returned incomplete historical tick data."
      );
    }

    if (prices.length !== times.length) {
      throw new Error(
        "Historical price and timestamp counts do not match."
      );
    }

    if (
      !prices.every(
        (price) =>
          Number.isFinite(Number(price))
      )
    ) {
      throw new Error(
        "Historical data contains invalid prices."
      );
    }

    if (
      !times.every(
        (time) =>
          Number.isInteger(time) && time > 0
      )
    ) {
      throw new Error(
        "Historical data contains invalid timestamps."
      );
    }

    console.log(
      `PASS: Received ${prices.length} real historical ticks.`
    );

    console.log(
      `Latest price: ${prices[prices.length - 1]}`
    );

    console.log(
      `Latest timestamp: ${times[times.length - 1]}`
    );

    console.log(
      "PASS: Deriv market-data smoke test completed."
    );
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error("FAIL: Deriv market-data smoke test.");
  console.error(error.message);
  process.exitCode = 1;
});
