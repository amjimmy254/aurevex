import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { listPalplussTransactions } from "@/lib/palpluss-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGES = 20;

type ProviderTransaction = {
  transaction_id?: string;
  type?: string;
  status?: string;
  amount?: number | string;
  phone_number?: string;
  external_reference?: string | null;
};

async function loadProviderTransactions(type: "STK" | "B2C") {
  const transactions: ProviderTransaction[] = [];
  let cursor: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page = await listPalplussTransactions(type, cursor);

    transactions.push(
      ...(page.items as ProviderTransaction[])
    );

    cursor = page.next_cursor ?? undefined;

    if (!cursor) {
      return {
        transactions,
        truncated: false,
      };
    }
  }

  return {
    transactions,
    truncated: Boolean(cursor),
  };
}

function amountMatches(
  providerAmount: number | string | undefined,
  databaseAmountCents: number
) {
  const amount = Number(providerAmount);

  if (!Number.isFinite(amount)) {
    return false;
  }

  return Math.round(amount * 100) === Number(databaseAmountCents);
}

function phoneMatches(
  providerPhone: string | undefined,
  databasePhone: string
) {
  return (
    typeof providerPhone === "string" &&
    providerPhone === databasePhone
  );
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const adminResult = await db.query(
      `SELECT role
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (adminResult.rows[0]?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Administrator access required." },
        { status: 403 }
      );
    }

    const [stkResult, b2cResult, depositsResult, withdrawalsResult] =
      await Promise.all([
        loadProviderTransactions("STK"),
        loadProviderTransactions("B2C"),

        db.query(
          `SELECT
             d.id,
             d.reference,
             d.palpluss_transaction_id,
             d.phone_number,
             d.amount_cents,
             d.status,
             t.status AS ledger_status
           FROM palpluss_deposits d
           JOIN real_money_transactions t
             ON t.id = d.transaction_id
            AND t.user_id = d.user_id
           WHERE d.status = 'AWAITING_PAYMENT'
           ORDER BY d.created_at ASC`
        ),

        db.query(
          `SELECT
             w.id,
             w.transaction_id,
             w.payout_id,
             w.destination_phone,
             w.amount_cents,
             w.idempotency_key,
             w.status,
             t.status AS ledger_status,
             t.source_reference
           FROM palpluss_withdrawals w
           JOIN real_funds_transactions t
             ON t.id = w.transaction_id
            AND t.user_id = w.user_id
           WHERE w.status IN ('PENDING', 'PROCESSING')
           ORDER BY w.created_at ASC`
        ),
      ]);

    const stkByReference = new Map(
      stkResult.transactions
        .filter((tx) => typeof tx.external_reference === "string")
        .map((tx) => [tx.external_reference as string, tx])
    );

    const b2cByReference = new Map(
      b2cResult.transactions
        .filter((tx) => typeof tx.external_reference === "string")
        .map((tx) => [tx.external_reference as string, tx])
    );

    const deposits = depositsResult.rows.map((deposit) => {
      const provider = stkByReference.get(deposit.reference);

      if (!provider) {
        return {
          reference: deposit.reference,
          databaseStatus: deposit.status,
          ledgerStatus: deposit.ledger_status,
          reconciliation: "NO_EXACT_PROVIDER_REFERENCE_MATCH",
        };
      }

      const amountOk = amountMatches(
        provider.amount,
        deposit.amount_cents
      );

      const phoneOk = phoneMatches(
        provider.phone_number,
        deposit.phone_number
      );

      const providerId = provider.transaction_id ?? null;

      const idOk =
        !deposit.palpluss_transaction_id ||
        deposit.palpluss_transaction_id === providerId;

      return {
        reference: deposit.reference,
        databaseStatus: deposit.status,
        ledgerStatus: deposit.ledger_status,
        providerTransactionId: providerId,
        providerStatus: provider.status ?? "UNKNOWN",
        amountMatches: amountOk,
        phoneMatches: phoneOk,
        transactionIdMatches: idOk,
        reconciliation:
          amountOk && phoneOk && idOk
            ? "MATCH_REQUIRES_STATUS_REVIEW"
            : "DETAILS_MISMATCH_REQUIRES_MANUAL_REVIEW",
      };
    });

    const withdrawals = withdrawalsResult.rows.map((withdrawal) => {
      const provider = b2cByReference.get(
        withdrawal.source_reference
      );

      if (!provider) {
        return {
          withdrawalId: withdrawal.id,
          databaseStatus: withdrawal.status,
          ledgerStatus: withdrawal.ledger_status,
          reconciliation: "NO_EXACT_PROVIDER_REFERENCE_MATCH",
        };
      }

      const amountOk = amountMatches(
        provider.amount,
        withdrawal.amount_cents
      );

      const phoneOk = phoneMatches(
        provider.phone_number,
        withdrawal.destination_phone
      );

      const providerId = provider.transaction_id ?? null;

      const idOk =
        !withdrawal.payout_id ||
        withdrawal.payout_id === providerId;

      return {
        withdrawalId: withdrawal.id,
        databaseStatus: withdrawal.status,
        ledgerStatus: withdrawal.ledger_status,
        providerTransactionId: providerId,
        providerStatus: provider.status ?? "UNKNOWN",
        amountMatches: amountOk,
        phoneMatches: phoneOk,
        transactionIdMatches: idOk,
        reconciliation:
          amountOk && phoneOk && idOk
            ? "MATCH_REQUIRES_STATUS_REVIEW"
            : "DETAILS_MISMATCH_REQUIRES_MANUAL_REVIEW",
      };
    });

    return NextResponse.json(
      {
        success: true,
        mode: "READ_ONLY",
        message:
          "Provider transactions compared with pending database records. No balances or transaction statuses were changed.",
        providerPagesTruncated: {
          stk: stkResult.truncated,
          b2c: b2cResult.truncated,
        },
        totals: {
          pendingDeposits: deposits.length,
          pendingWithdrawals: withdrawals.length,
          providerStkTransactions: stkResult.transactions.length,
          providerB2cTransactions: b2cResult.transactions.length,
        },
        deposits,
        withdrawals,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Palpluss reconciliation inspection failed:", error);

    return NextResponse.json(
      {
        error: "Could not complete provider reconciliation inspection.",
      },
      { status: 502 }
    );
  }
}
