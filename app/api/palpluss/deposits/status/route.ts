import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getPalplussTransaction } from "@/lib/palpluss";

export const runtime = "nodejs";

type ProviderTransaction = {
  transaction_id?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  phone_number?: string;
  external_reference?: string;
  mpesa_receipt?: string;
};

export async function GET(request: NextRequest) {
  if (process.env.PALPLUSS_DEPOSITS_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Palpluss deposits are not enabled." },
      { status: 503 }
    );
  }

  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to continue." },
      { status: 401 }
    );
  }

  const reference = request.nextUrl.searchParams.get("reference");

  if (
    !reference ||
    !/^AUR-[0-9a-f-]{36}$/i.test(reference)
  ) {
    return NextResponse.json(
      { error: "A valid deposit reference is required." },
      { status: 400 }
    );
  }

  const existing = await db.query(
    `SELECT
       d.transaction_id,
       d.reference,
       d.palpluss_transaction_id,
       d.amount_cents,
       d.phone,
       d.status AS deposit_status,
       t.wallet_id
     FROM palpluss_deposits d
     JOIN real_money_transactions t
       ON t.id = d.transaction_id
     WHERE d.reference = $1
       AND d.user_id = $2
       AND t.provider = 'PALPLUSS'
     LIMIT 1`,
    [reference, userId]
  );

  const deposit = existing.rows[0];

  if (!deposit) {
    return NextResponse.json(
      { error: "Deposit not found." },
      { status: 404 }
    );
  }

  if (
    deposit.deposit_status === "SUCCEEDED" ||
    deposit.deposit_status === "FAILED" ||
    deposit.deposit_status === "CANCELLED" ||
    deposit.deposit_status === "EXPIRED" ||
    deposit.deposit_status === "REVERSED"
  ) {
    return NextResponse.json({
      success: true,
      reference,
      status: deposit.deposit_status
    });
  }

  if (!deposit.palpluss_transaction_id) {
    return NextResponse.json({
      success: true,
      reference,
      status: deposit.deposit_status,
      message: "Waiting for the payment provider to confirm the request."
    });
  }

  let provider: ProviderTransaction;

  try {
    provider = await getPalplussTransaction(
      String(deposit.palpluss_transaction_id)
    ) as ProviderTransaction;
  } catch (error) {
    console.error("Palpluss status lookup failed:", error);

    return NextResponse.json(
      { error: "Unable to verify payment with Palpluss. Please try again." },
      { status: 502 }
    );
  }

  const providerAmount = Number(provider.amount);
  const providerAmountCents = Math.round(providerAmount * 100);

  if (
    provider.transaction_id !== String(deposit.palpluss_transaction_id) ||
    provider.external_reference !== reference ||
    provider.currency !== "KES" ||
    provider.phone_number !== deposit.phone ||
    !Number.isFinite(providerAmount) ||
    !Number.isSafeInteger(providerAmountCents) ||
    providerAmountCents !== Number(deposit.amount_cents)
  ) {
    console.error("Palpluss transaction verification mismatch:", {
      reference,
      transactionIdMatches:
        provider.transaction_id === String(deposit.palpluss_transaction_id),
      referenceMatches: provider.external_reference === reference,
      currencyMatches: provider.currency === "KES",
      phoneMatches: provider.phone_number === deposit.phone,
      amountMatches:
        providerAmountCents === Number(deposit.amount_cents)
    });

    return NextResponse.json(
      { error: "Payment details could not be verified." },
      { status: 409 }
    );
  }

  const providerStatus = String(provider.status ?? "").toUpperCase();

  const statusMap: Record<string, string> = {
    PENDING: "PROCESSING",
    PROCESSING: "PROCESSING",
    SUCCESS: "SUCCEEDED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    REVERSED: "REVERSED"
  };

  const nextStatus = statusMap[providerStatus];

  if (!nextStatus) {
    return NextResponse.json(
      { error: "Palpluss returned an unrecognized payment status." },
      { status: 502 }
    );
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const locked = await client.query(
      `SELECT
         d.id,
         d.transaction_id,
         d.amount_cents,
         d.status AS deposit_status,
         t.wallet_id
       FROM palpluss_deposits d
       JOIN real_money_transactions t
         ON t.id = d.transaction_id
       WHERE d.reference = $1
         AND d.user_id = $2
         AND t.provider = 'PALPLUSS'
       FOR UPDATE OF d, t`,
      [reference, userId]
    );

    const current = locked.rows[0];

    if (!current) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Deposit not found." },
        { status: 404 }
      );
    }

    if (
      current.deposit_status === "SUCCEEDED" ||
      current.deposit_status === "FAILED" ||
      current.deposit_status === "CANCELLED" ||
      current.deposit_status === "EXPIRED" ||
      current.deposit_status === "REVERSED"
    ) {
      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        reference,
        status: current.deposit_status
      });
    }

    await client.query(
      `UPDATE palpluss_deposits
       SET status = $1,
           mpesa_receipt = COALESCE($2, mpesa_receipt),
           updated_at = NOW()
       WHERE id = $3`,
      [
        nextStatus,
        provider.mpesa_receipt ?? null,
        current.id
      ]
    );

    if (nextStatus === "SUCCEEDED") {
      const walletUpdate = await client.query(
        `UPDATE real_wallets
         SET available_balance =
               available_balance + ($1::numeric / 100),
             updated_at = NOW()
         WHERE id = $2
         RETURNING id`,
        [current.amount_cents, current.wallet_id]
      );

      if (!walletUpdate.rows[0]) {
        throw new Error("Wallet not found for verified deposit.");
      }
    }

    if (
      nextStatus === "SUCCEEDED" ||
      nextStatus === "FAILED" ||
      nextStatus === "CANCELLED" ||
      nextStatus === "EXPIRED" ||
      nextStatus === "REVERSED"
    ) {
      await client.query(
        `UPDATE real_money_transactions
         SET status = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [
          nextStatus === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
          current.transaction_id
        ]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      reference,
      status: nextStatus,
      message:
        nextStatus === "SUCCEEDED"
          ? "Payment verified successfully."
          : "Payment status updated."
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Palpluss status processing error:", error);

    return NextResponse.json(
      { error: "Could not safely update the deposit status." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
