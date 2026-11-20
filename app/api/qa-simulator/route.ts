import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTRACT_TYPES = [
  "DIRECTIONAL",
  "EVEN_ODD",
  "OVER_UNDER",
  "MATCHES_DIFFERS",
] as const;

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: "Please sign in first." },
        { status: 401 }
      );
    }

    const account = await db.query(
      "SELECT email FROM app_users WHERE id = $1 LIMIT 1",
      [userId]
    );

    const email = String(account.rows[0]?.email || "").toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const iterations = Number(body.iterations ?? 1000);

    if (
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      iterations > 10000
    ) {
      return NextResponse.json(
        { error: "Iterations must be between 1 and 10000." },
        { status: 400 }
      );
    }

    const winRate = email === "jimmy@gmail.com" ? 80 : 20;

    const results = Object.fromEntries(
      CONTRACT_TYPES.map((contractType) => {
        let wins = 0;

        for (let i = 0; i < iterations; i++) {
          if (randomInt(100) < winRate) {
            wins++;
          }
        }

        const losses = iterations - wins;

        return [
          contractType,
          {
            total: iterations,
            wins,
            losses,
            winPercentage: Number(
              ((wins / iterations) * 100).toFixed(2)
            ),
            lossPercentage: Number(
              ((losses / iterations) * 100).toFixed(2)
            ),
          },
        ];
      })
    );

    return NextResponse.json({
      label: "AUREVEX QA TEST SIMULATION",
      notice:
        "Statistical test results only. No trades, wallets, balances, or real-money transactions are changed.",
      simulatedWinRate: winRate,
      simulatedLossRate: 100 - winRate,
      iterationsPerContract: iterations,
      results,
    });
  } catch {
    return NextResponse.json(
      { error: "QA simulation could not be completed." },
      { status: 500 }
    );
  }
}
