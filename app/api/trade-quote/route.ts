import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSimulatedPrice } from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYOUT = 1.95;

function getPriceDigit(asset: string, price: number) {
  const decimals =
    asset === "USD/JPY"
      ? 3
      : ["EUR/USD", "GBP/USD"].includes(asset)
        ? 5
        : 2;

  return Number(price.toFixed(decimals).replace(".", "").slice(-1));
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please log in again." },
      { status: 401 }
    );
  }

  const mode = request.nextUrl.searchParams.get("mode");
  const tradeId = request.nextUrl.searchParams.get("tradeId");

  if (!["DEMO", "REAL"].includes(mode || "") || !tradeId) {
    return NextResponse.json(
      { error: "Invalid quote request." },
      { status: 400 }
    );
  }

  try {
    const table =
      mode === "DEMO"
        ? "demo_trades"
        : "real_mode_simulated_trades";

    const activeStatus =
      mode === "DEMO" ? "PENDING" : "OPEN";

    const result = await db.query(
      `SELECT id, asset, amount, expiry_seconds,
              created_at, contract_type,
              contract_prediction, direction,
              entry_price, entry_digit
       FROM ${table}
       WHERE id::text = $1
         AND user_id = $2
         AND status = $3
       LIMIT 1`,
      [tradeId, userId, activeStatus]
    );

    const trade = result.rows[0];

    if (!trade) {
      return NextResponse.json(
        { error: "No active trade found." },
        { status: 404 }
      );
    }

    const now = Date.now();
    const createdAt = new Date(trade.created_at).getTime();
    const durationMs = Number(trade.expiry_seconds) * 1000;
    const stake = Number(trade.amount);

    if (
      !Number.isFinite(createdAt) ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      !Number.isFinite(stake) ||
      stake <= 0
    ) {
      throw new Error("Invalid trade data.");
    }

    if (now >= createdAt + durationMs) {
      return NextResponse.json(
        { error: "Trade has expired." },
        { status: 409 }
      );
    }

    const currentPrice = getSimulatedPrice(
      trade.asset,
      now
    );

    const currentDigit = getPriceDigit(
      trade.asset,
      currentPrice
    );

    const prediction =
      trade.contract_prediction || trade.direction;

    const entryPrice = Number(trade.entry_price);
    const entryDigit =
      trade.entry_digit === null
        ? null
        : Number(trade.entry_digit);

   let winningNow = false;

    if (mode === "REAL") {
      const outcome = await db.query(
        `SELECT is_winner
         FROM test_win_outcomes
         WHERE source = 'REAL_SIM'
           AND trade_id = $1
         LIMIT 1`,
        [trade.id]
      );

      if (typeof outcome.rows[0]?.is_winner !== "boolean") {
        throw new Error("Saved REAL outcome is unavailable.");
      }

      winningNow = outcome.rows[0].is_winner;
    } else {
      switch (trade.contract_type) {
        case "DIRECTIONAL":
          winningNow =
            prediction === "CALL"
              ? currentPrice > entryPrice
              : prediction === "PUT"
                ? currentPrice < entryPrice
                : false;
          break;

        case "EVEN_ODD":
          winningNow =
            prediction === "EVEN"
              ? currentDigit % 2 === 0
              : prediction === "ODD"
                ? currentDigit % 2 !== 0
                : false;
          break;

        case "OVER_UNDER":
          winningNow =
            entryDigit !== null &&
            (prediction === "OVER"
              ? currentDigit > entryDigit
              : prediction === "UNDER"
                ? currentDigit < entryDigit
                : false);
          break;

        case "MATCHES_DIFFERS":
          winningNow =
            entryDigit !== null &&
            (prediction === "MATCHES"
              ? currentDigit === entryDigit
              : prediction === "DIFFERS"
                ? currentDigit !== entryDigit
                : false);
          break;

        default:
          throw new Error("Unsupported trade type.");
      }
    }

    const elapsedFraction = Math.max(
      0,
      Math.min(1, (now - createdAt) / durationMs)
    );

    const rawValue = winningNow
      ? stake * (1 + (PAYOUT - 1) * elapsedFraction)
      : stake * (1 - elapsedFraction);

    const cashOutAmount = Math.max(
      0.01,
      Math.round(rawValue * 100) / 100
    );

    const netResult =
      Math.round((cashOutAmount - stake) * 100) / 100;

    return NextResponse.json(
      {
        tradeId: trade.id,
        netResult,
        currentDigit,
        winningNow,
        simulationOnly: mode === "REAL"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Live trade quote error:", error);

    return NextResponse.json(
      { error: "Could not calculate live trade result." },
      { status: 500 }
    );
  }
}
