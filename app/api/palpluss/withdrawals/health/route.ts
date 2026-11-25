import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in." },
      { status: 401 }
    );
  }

  try {
    const result = await db.query(`
      SELECT
        to_regclass('public.palpluss_withdrawals') IS NOT NULL
          AS withdrawals_table_ready,
        to_regclass('public.real_funds_wallets') IS NOT NULL
          AS real_funds_wallets_table_ready
    `);

    const ready =
      result.rows[0]?.withdrawals_table_ready === true &&
     result.rows[0]?.real_funds_wallets_table_ready === true;
    return NextResponse.json(
      {
        databaseConnected: true,
        withdrawalsTableReady:
          result.rows[0]?.withdrawals_table_ready,
        realFundsWalletsTableReady:
          result.rows[0]?.real_funds_wallets_table_ready
      },
      { status: ready ? 200 : 503 }
    );
  } catch (error) {
    console.error("Withdrawal health check failed:", error);

    return NextResponse.json(
      { error: "Test database check failed." },
      { status: 500 }
    );
  }
}
