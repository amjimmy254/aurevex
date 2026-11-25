import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DERIV_PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

type DerivActiveSymbol = {
  underlying_symbol?: string;
  underlying_symbol_name?: string;
  underlying_symbol_type?: string;
  pip_size?: number;

  symbol?: string;
  display_name?: string;
  symbol_type?: string;
  pip?: number;

  market?: string;
  submarket?: string;
  market_display_name?: string;
  submarket_display_name?: string;

  exchange_is_open?: number;
  is_trading_suspended?: number;
};

type DerivMessage = {
  msg_type?: string;
  active_symbols?: DerivActiveSymbol[];
  error?: {
    code?: string;
    message?: string;
  };
};

function getActiveSymbols(): Promise<DerivActiveSymbol[]> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(DERIV_PUBLIC_WS);
    let settled = false;

    const finish = (
      error?: Error,
      symbols?: DerivActiveSymbol[]
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
      } else {
        resolve(symbols ?? []);
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error("Deriv connection timed out."));
    }, 12000);

    socket.addEventListener("open", () => {
      try {
        socket.send(
          JSON.stringify({
            active_symbols: "full",
            req_id: 1001,
          })
        );
      } catch {
        finish(new Error("Could not request Deriv markets."));
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
          Array.isArray(message.active_symbols)
        ) {
          finish(undefined, message.active_symbols);
        }
      } catch {
        finish(
          new Error("Invalid response received from Deriv.")
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

export async function GET() {
  try {
    const symbols = await getActiveSymbols();

    const volatilityMarkets = symbols
      .map((item) => {
        const symbol =
          item.underlying_symbol ?? item.symbol;

        const name =
          item.underlying_symbol_name ??
          item.display_name;

        const symbolType =
          item.underlying_symbol_type ??
          item.symbol_type ??
          null;

        const pipSize =
          typeof item.pip_size === "number"
            ? item.pip_size
            : typeof item.pip === "number"
              ? Math.pow(10, -item.pip)
              : null;

        return {
          symbol,
          name,
          market:
            item.market_display_name ??
            item.market ??
            null,
          submarket:
            item.submarket_display_name ??
            item.submarket ??
            null,
          symbolType,
          pipSize,
          isOpen: item.exchange_is_open ?? null,
          isSuspended:
            item.is_trading_suspended ?? null,
        };
      })
      .filter(
        (item) =>
          typeof item.symbol === "string" &&
          typeof item.name === "string" &&
          item.name.toLowerCase().includes("volatility") &&
          typeof item.pipSize === "number" &&
          Number.isFinite(item.pipSize) &&
          item.pipSize > 0
      )
     .sort((a, b) =>
  (a.name ?? "").localeCompare(b.name ?? "")
);

    if (volatilityMarkets.length === 0) {
      throw new Error(
        "Deriv returned no valid Volatility Index markets."
      );
    }

    return NextResponse.json(
      {
        provider: "Deriv",
        source: "public WebSocket",
        simulated: false,
        updatedAt: new Date().toISOString(),
        count: volatilityMarkets.length,
        markets: volatilityMarkets,
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
        : "Deriv market data is unavailable.";

    return NextResponse.json(
      {
        provider: "Deriv",
        simulated: false,
        error: message,
      },
      { status: 503 }
    );
  }
}
