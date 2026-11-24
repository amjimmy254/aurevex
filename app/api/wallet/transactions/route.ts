
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) return error("Please sign in again.", 401);

  try {
    const result = await db.query(
      `SELECT id, transaction_type, amount, note, created_at
       FROM demo_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return NextResponse.json(
      { transactions: result.rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("Wallet activity error:", e);
    return error("Could not load wallet activity.", 500);
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return error("Please sign in again.", 401);
  }

  return error(
    "Demo deposits and withdrawals are temporarily disabled.",
    503
  );
}
    await client.query("COMMIT");

    return NextResponse.json({
      message: isDeposit
        ? "Simulated demo deposit completed. No real money received."
        : "Simulated demo withdrawal completed. No real money sent.",
      transaction: transaction.rows[0]
    }, { status: 201 });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Wallet action error:", e);
    return error("Could not complete wallet action.", 500);
  } finally {
    client.release();
  }
}
