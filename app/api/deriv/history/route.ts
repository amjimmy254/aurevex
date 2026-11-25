import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DERIV_PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const DEFAULT_COUNT = 1000;
const MAX_COUNT = 5000;

type ActiveSymbol = {
  underlying_symbol?: string;
  underlying_symbol_name?: string;
  pip_size?: number;

  symbol?: string;
  display_name?: string;
  pip?: number;
};

type DerivHistory = {
  prices?: Array<number | string>;
  times?: number[];
};

type DerivMessage = {
  msg_type?: string;
  active_symbols?: ActiveSymbol[];
  history?: DerivHistory;
  error?: {
    code?: string;
    message?: string;
  };
};

class DerivRouteError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function getPriceIncrement(item: ActiveSymbol): number | null {
  if (
    typeof item.pip_size === "number" &&
    Number.isFinite(item.pip_size) &&
    item.pip_size > 0
  ) {
    return item.pip_size;
  }

  if (
    typeof item.pip === "number" &&
    Number.isInteger(item.pip) &&
    item.pip >= 0 &&
    item.pip <= 12
  ) {
    return Math.pow(10, -item.pip);
  }

  return null;
}

function getDecimalPlaces(increment: number): number {
  const value = increment.toString().toLowerCase();
  const [coefficient, exponentText] = value.split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const decimalPart = coefficient.split(".")[1] ?? "";

  return Math.max(0, decimalPart.length - exponent);
}

function getHistoricalTicks(
  symbol: string,
  count: number
): Promise<{
  prices: Array<number | string>;
  times: number[];
  pipSize: number;
}> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(DERIV_PUBLIC_WS);
    let settled = false;
    let historyRequested = false;
    let pipSize: number | null = null;

    const finish = (
      error?: Error,
      result?: {
        prices: Array<number | string>;
        times: number[];
        pipSize: number;
      }
    ) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      try {
        socket.close();
      } catch {
        // Socket may already be closed.
      }

      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      } else {
        reject(new Error("Deriv returned no historical data."));
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error("Deriv market-data request timed out."));
    }, 15000);

    socket.addEventListener("open", () => {
      try {
        socket.send(
          JSON.stringify({
            active_symbols: "full",
            req_id: 2001,
          })
        );
      } catch {
        finish(new Error("Could not request active Deriv symbols."));
      }
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(
          String(event.data)
        ) as DerivMessage;

        if (message.error) {
          finish(
            new Error(
              message.error.message ||
                "Deriv returned a market-data error."
            )
          );
          return;
        }

        if (
          message.msg_type === "active_symbols" &&
          !historyRequested
        ) {
          const activeSymbol = (
            message.active_symbols ?? []
          ).find((item) => {
            const itemSymbol =
              item.underlying_symbol ?? item.symbol;

            const itemName =
              item.underlying_symbol_name ??
              item.display_name ??
              "";

            return (
              itemSymbol === symbol &&
              itemName.toLowerCase().includes("volatility")
            );
          });

          if (!activeSymbol) {
            finish(
              new DerivRouteError(
                "The requested symbol is not an active Volatility Index.",
                404
              )
            );
            return;
          }

          pipSize = getPriceIncrement(activeSymbol);

          if (pipSize === null) {
            finish(
              new Error(
                "Deriv did not provide valid price precision metadata."
              )
            );
            return;
          }

          historyRequested = true;

          socket.send(
            JSON.stringify({
              ticks_history: symbol,
              count,
              end: "latest",
              style: "ticks",
              req_id: 2002,
            })
          );

          return;
        }

        if (message.msg_type === "history") {
          const prices = message.history?.prices;
          const times = message.history?.times;

          if (
            !Array.isArray(prices) ||
            prices.length === 0 ||
            !Array.isArray(times) ||
            times.length !== prices.length ||
            pipSize === null
          ) {
            finish(
              new Error("Deriv returned incomplete tick history.")
            );
            return;
          }

          const validPrices = prices.every((price) =>
            Number.isFinite(Number(price))
          );

          const validTimes = times.every(
            (time) =>
              Number.isInteger(time) &&
              Number.isFinite(time)
          );

          if (!validPrices || !validTimes) {
            finish(
              new Error("Deriv returned invalid tick values.")
            );
            return;
          }

          finish(undefined, {
            prices,
            times,
            pipSize,
          });
        }
      } catch {
        finish(
          new Error("Could not process Deriv's response.")
        );
      }
    });

    socket.addEventListener("error", () => {
      finish(
        new Error("Could not connect to Deriv market data.")
      );
    });

    socket.addEventListener("close", () => {
      if (!settled) {
        finish(
          new Error("Deriv closed the market-data connection.")
        );
      }
    });
  });
}

function calculateDigitFrequencies(
  prices: Array<number | string>,
  pipSize: number
) {
  const decimalPlaces = getDecimalPlaces(pipSize);
  const counts = Array(10).fill(0) as number[];

  for (const price of prices) {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice)) {
      continue;
    }

    const formatted = Math.abs(numericPrice).toFixed(
      decimalPlaces
    );

    const finalDigits =
      decimalPlaces > 0
        ? formatted.split(".")[1] ?? ""
        : formatted;

    const finalDigit = Number(finalDigits.slice(-1));

    if (
      Number.isInteger(finalDigit) &&
      finalDigit >= 0 &&
      finalDigit <= 9
    ) {
      counts[finalDigit]++;
    }
  }

  const total = counts.reduce(
    (sum, value) => sum + value,
    0
  );

  return counts.map((count, digit) => ({
    digit,
    count,
    percentage:
      total > 0
        ? Number(((count / total) * 100).toFixed(2))
        : 0,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol");

    const countParam =
      request.nextUrl.searchParams.get("count");

    const count =
      countParam === null
        ? DEFAULT_COUNT
        : Number(countParam);

    if (!symbol || !/^[A-Za-z0-9_]{2,30}$/.test(symbol)) {
      return NextResponse.json(
        { error: "A valid Deriv symbol is required." },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(count) ||
      count < 10 ||
      count > MAX_COUNT
    ) {
      return NextResponse.json(
        {
          error: `Count must be an integer between 10 and ${MAX_COUNT}.`,
        },
        { status: 400 }
      );
    }

    const result = await getHistoricalTicks(symbol, count);

    const digitFrequencies = calculateDigitFrequencies(
      result.prices,
      result.pipSize
    );

    return NextResponse.json(
      {
        provider: "Deriv",
        symbol,
        source: "Historical Deriv ticks",
        simulated: false,
        updatedAt: new Date().toISOString(),
        requestedCount: count,
        receivedCount: result.prices.length,
        pipSize: result.pipSize,
        decimalPlaces: getDecimalPlaces(result.pipSize),
        prices: result.prices,
        times: result.times,
        digitFrequencies,
        calculation:
          "Observed final-digit frequencies from historical prices. Not predictions.",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Historical market data is unavailable.";

    const status =
      error instanceof DerivRouteError
        ? error.status
        : 503;

    return NextResponse.json(
      {
        provider: "Deriv",
        simulated: false,
        error: message,
      },
      { status }
    );
  }
}
