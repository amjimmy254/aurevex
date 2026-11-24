import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { cyzoraRequest } from "@/lib/cyzora";

export const runtime = "nodejs";

type FeePreview = {
  amount?: number;
  fee?: number;
  wallet?: string;
  destination?: string;
};

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: "Withdrawal fee previews are disabled." },
    { status: 503 }
  );
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to continue." },
      { status: 401 }
    );
  }

  const amount = Number(
    request.nextUrl.searchParams.get("amount")
  );

  if (
    !Number.isSafeInteger(amount) ||
    amount < 65000 ||
    amount % 100 !== 0
  ) {
    return NextResponse.json(
      { error: "Withdrawal must be at least KES 650 in whole shillings." },
      { status: 400 }
    );
  }

  try {
    const preview = await cyzoraRequest<FeePreview>(
      `/payouts/fee-preview?amount=${amount}&wallet=collections&destination=mobile`
    );

    if (
      preview.amount !== amount ||
      !Number.isSafeInteger(preview.fee) ||
      (preview.fee as number) < 0
    ) {
      return NextResponse.json(
        { error: "Cyzora returned an invalid fee preview." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        amount: amount / 100,
        fee: (preview.fee as number) / 100,
        totalProviderFeeCents: preview.fee,
        currency: "KES",
        destination: "mobile",
        wallet: "collections",
        mode: "TEST"
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    console.error("Withdrawal fee preview error:", error);

    return NextResponse.json(
      { error: "Could not retrieve the current withdrawal fee." },
      { status: 502 }
    );
  }
}
