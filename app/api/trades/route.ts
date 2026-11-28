import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getSimulatedQuote, isSupportedAsset } from "@/lib/market-data";
import { withTx } from "@/lib/tx";
import {
  CONTRACTS,
  MAX_ACTIVE_TRADES,
  MAX_EXPIRY,
  MAX_STAKE,
  MIN_EXPIRY,
  MIN_STAKE,
  TABLES,
  isContractType,
  isValidPrediction,
  lastDigit,
  payoutFor,
  round2,
  type Mode,
} from "@/lib/trading";
import { debit, ensureWallet } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid trade request." }, { status: 400 });
  }

  const mode = String(body.mode || "").trim().toUpperCase() as Mode;
  const asset = String(body.asset || "").trim();
  const contractType = String(body.contractType || "").trim().toUpperCase();
  const prediction = String(body.prediction || "").trim().toUpperCase();
  const clientTradeId = body.clientTradeId
    ? String(body.clientTradeId).slice(0, 64)
    : null;
  const amount = Number(body.amount);
  const expirySeconds = Math.round(Number(body.expirySeconds));

  if (!(mode in TABLES)) {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }
  if (!asset || !isSupportedAsset(asset)) {
    return NextResponse.json({ error: "Unsupported asset." }, { status: 400 });
  }
  if (!isContractType(contractType) || !isValidPrediction(contractType, prediction)) {
    return NextResponse.json({ error: "Invalid contract type." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount < MIN_STAKE || amount > MAX_STAKE) {
    return NextResponse.json(
      { error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE}.` },
      { status: 400 }
    );
  }
  if (
    !Number.isFinite(expirySeconds) ||
    expirySeconds < MIN_EXPIRY ||
    expirySeconds > MAX_EXPIRY
  ) {
    return NextResponse.json({ error: "Invalid expiry." }, { status: 400 });
  }

  const stake = round2(amount);
  const { table, activeStatus } = TABLES[mode];
  const predictionColumn = mode === "DEMO" ? "contract_prediction" : "direction";

  // Quote is taken inside the tx so the entry print and the charge are one unit.
  const payoutMultiplier = payoutFor(contractType, prediction);

  try {
    const outcome = await withTx(async (client) => {
      const active = await client.query(
        `SELECT count(*)::int AS n FROM ${table}
         WHERE user_id = $1 AND status = $2`,
        [userId, activeStatus]
      );

      if (Number(active.rows[0]?.n ?? 0) >= MAX_ACTIVE_TRADES) {
        throw new HttpError(
          429,
          `You already have ${MAX_ACTIVE_TRADES} open trades.`
        );
      }

      const quote = getSimulatedQuote(asset, Date.now());
      const entryPrice =
        prediction === "CALL" ? quote.ask : prediction === "PUT" ? quote.bid : quote.mid;
      const entryDigit = lastDigit(quote.mid, quote.digits);

      await ensureWallet(client, userId, mode);

      const inserted = await client.query(
        `INSERT INTO ${table}
           (user_id, asset, amount, expiry_seconds, contract_type,
            ${predictionColumn}, entry_price, entry_digit, payout_multiplier,
            status, client_trade_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (user_id, client_trade_id)
           WHERE client_trade_id IS NOT NULL
           DO NOTHING
         RETURNING id, created_at`,
        [
          userId,
          quote.asset,
          stake,
          expirySeconds,
          contractType,
          prediction,
          entryPrice,
          entryDigit,
          payoutMultiplier,
          activeStatus,
          clientTradeId,
        ]
      );

      const trade = inserted.rows[0];

      // Duplicate submit: hand back the original, charge nothing.
      if (!trade) {
        const existing = await client.query(
          `SELECT id, created_at FROM ${table}
           WHERE user_id = $1 AND client_trade_id = $2
           LIMIT 1`,
          [userId, clientTradeId]
        );

        const row = existing.rows[0];
        if (!row) throw new HttpError(409, "Could not open trade.");

        return {
          duplicate: true,
          tradeId: row.id,
          createdAt: new Date(row.created_at).getTime(),
          balance: null,
          quote,
          entryPrice,
          entryDigit,
        };
      }

      const balance = await debit(
        client,
        userId,
        mode,
        stake,
        "TRADE_STAKE",
        trade.id
      );

      if (balance === null) throw new HttpError(402, "Insufficient balance.");

      return {
        duplicate: false,
        tradeId: trade.id,
        createdAt: new Date(trade.created_at).getTime(),
        balance,
        quote,
        entryPrice,
        entryDigit,
      };
    });

    const expiresAt = outcome.createdAt + expirySeconds * 1000;

    return NextResponse.json(
      {
        tradeId: outcome.tradeId,
        duplicate: outcome.duplicate,
        mode,
        asset: outcome.quote.asset,
        contractType,
        prediction,
        stake,
        payoutMultiplier,
        potentialPayout: round2(stake * payoutMultiplier),
        entryPrice: outcome.entryPrice,
        entryDigit: outcome.entryDigit,
        entryBid: outcome.quote.bid,
        entryAsk: outcome.quote.ask,
        digits: outcome.quote.digits,
        expiresAt,
        expiresInMs: Math.max(0, expiresAt - Date.now()),
        balance: outcome.balance,
        options: CONTRACTS[contractType],
        simulationOnly: mode === "REAL",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Open trade error:", error);
    return NextResponse.json({ error: "Could not open trade." }, { status: 500 });
  }
}
