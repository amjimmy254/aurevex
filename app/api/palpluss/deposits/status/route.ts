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

  if (!reference || !/^AUR-[0-9a-f-]{36}$/i.test(reference)) {
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
    ["FAILED", "CANCELLED", "EXPIRED", "REVERSED"].includes(
      deposit.deposit_status
    )
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
      message: "Waiting for provider confirmation."
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
      { error: "Unable to verify payment with Palpluss." },
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
    return NextResponse.json(
      { error: "Payment details could not be verified." },
      { status: 409 }
    );
  }

  const statusMap: Record<string, string> = {
    PENDING: "PROCESSING",
    PROCESSING: "PROCESSING",
    SUCCESS: "SUCCEEDED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    REVERSED: "REVERSED"
  };

  const nextStatus = statusMap[
    String(provider.status ?? "").toUpperCase()
  ];

  if (!nextStatus) {
    return NextResponse.json(
      { error: "Unrecognized provider payment status." },
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
      ["FAILED", "CANCELLED", "EXPIRED", "REVERSED"].includes(
        current.deposit_status
      )
    ) {
      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        reference,
        status: current.deposit_status
      });
    }

    // Never downgrade a successful payment to a pending or failed state.
    if (
      current.deposit_status === "SUCCEEDED" &&
      nextStatus !== "REVERSED" &&
      nextStatus !== "SUCCEEDED"
    ) {
      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        reference,
        status: "SUCCEEDED"
      });
    }

    if (nextStatus === "SUCCEEDED") {
      const ledger = await client.query(
        `INSERT INTO real_wallet_ledger (
           wallet_id, user_id, transaction_id,
           entry_type, amount, currency
         )
         VALUES (
           $1, $2, $3, 'DEPOSIT_CREDIT',
           $4::numeric / 100, 'KES'
         )
         ON CONFLICT (transaction_id, entry_type)
         DO NOTHING
         RETURNING id`,
        [
          current.wallet_id,
          userId,
          current.transaction_id,
          current.amount_cents
        ]
      );

      // Credit only once, when the ledger entry is first created.
      if (ledger.rows[0]) {
        const wallet = await client.query(
          `UPDATE real_wallets
           SET available_balance =
                 available_balance + ($1::numeric / 100),
               updated_at = NOW()
           WHERE id = $2
           RETURNING id`,
          [current.amount_cents, current.wallet_id]
        );

        if (!wallet.rows[0]) {
          throw new Error("Wallet not found for verified deposit.");
        }
      }
    }

    if (nextStatus === "REVERSED") {
      // Only recover funds if this deposit was previously credited.
      if (current.deposit_status === "SUCCEEDED") {
        const walletResult = await client.query(
          `SELECT available_balance, reversal_debt
           FROM real_wallets
           WHERE id = $1
           FOR UPDATE`,
          [current.wallet_id]
        );

        const wallet = walletResult.rows[0];

        if (!wallet) {
          throw new Error("Wallet not found for reversed deposit.");
        }

        const balance = Number(wallet.available_balance);
        const amount = Number(current.amount_cents) / 100;
        const recovered = Math.min(balance, amount);
        const outstanding = amount - recovered;

        const reversalLedger = await client.query(
          `INSERT INTO real_wallet_ledger (
             wallet_id, user_id, transaction_id,
             entry_type, amount, currency, metadata
           )
           VALUES (
             $1, $2, $3, 'DEPOSIT_REVERSAL',
             $4, 'KES', $5::jsonb
           )
           ON CONFLICT (transaction_id, entry_type)
           DO NOTHING
           RETURNING id`,
          [
            current.wallet_id,
            userId,
            current.transaction_id,
            amount,
            JSON.stringify({
              recovered,
              outstanding,
              provider: "PALPLUSS"
            })
          ]
        );

        if (reversalLedger.rows[0]) {
          await client.query(
            `UPDATE real_wallets
             SET available_balance = available_balance - $1,
                 reversal_debt = reversal_debt + $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [recovered, outstanding, current.wallet_id]
          );
        }
      }
    }

    await client.query(
      `UPDATE palpluss_deposits
       SET status = $1,
           mpesa_receipt = COALESCE($2, mpesa_receipt),
           updated_at = NOW()
       WHERE id = $3`,
      [nextStatus, provider.mpesa_receipt ?? null, current.id]
    );

    if (
      ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED", "REVERSED"].includes(
        nextStatus
      )
    ) {
      await client.query(
        `UPDATE real_money_transactions
         SET status = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [
          nextStatus === "SUCCEEDED"
            ? "SUCCEEDED"
            : nextStatus === "REVERSED"
              ? "REVERSED"
              : "FAILED",
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
          : nextStatus === "REVERSED"
            ? "Payment reversal recorded."
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
