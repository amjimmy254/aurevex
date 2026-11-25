import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DERIV_PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

type DerivActiveSymbol = {
  symbol?: string;
  display_name?: string;
  market_display_name?: string;
  submarket_display_name?: string;
  symbol_type?: string;
  exchange_is_open?: number;
  is_trading_suspended?: number;
  pip?: number;
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
      .filter((item) => {
        const name = (
          item.display_name || ""
        ).toLowerCase();

        const market = (
          item.market_display_name || ""
        ).toLowerCase();

        const submarket = (
          item.submarket_display_name || ""
        ).toLowerCase();

       return name.includes("volatility");
      })
      .filter(
        (item) =>
          typeof item.symbol === "string" &&
          typeof item.display_name === "string"
      )
      .map((item) => ({
        symbol: item.symbol,
        name: item.display_name,
        market: item.market_display_name ?? null,
        submarket: item.submarket_display_name ?? null,
        symbolType: item.symbol_type ?? null,
        pip: item.pip ?? null,
        isOpen: item.exchange_is_open ?? null,
        isSuspended:
          item.is_trading_suspended ?? null,
      }))
    .sort((a, b) =>
  (a.name ?? "").localeCompare(b.name ?? "")
);
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
