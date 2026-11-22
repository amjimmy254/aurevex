import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type PalplussEvent = {
  event?: string;
  data?: {
    id?: string;
    amount?: number;
    currency?: string;
    phone_number?: string;
    external_reference?: string;
    provider_request_id?: string;
    provider_checkout_id?: string;
    result_code?: string | number;
    result_desc?: string;
    mpesa_receipt?: string;
    status?: string;
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let payload: PalplussEvent;

  try {
    payload = JSON.parse(rawBody) as PalplussEvent;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const event = payload.event;
  const data = payload.data;

  if (
    !event ||
    !data ||
    !data.id ||
    !data.external_reference
  ) {
    return NextResponse.json(
      { error: "Missing event or transaction details." },
      { status: 400 }
    );
  }

  if (
    event !== "transaction.success" &&
    event !== "transaction.failed"
  ) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // Authentication and database processing are intentionally
  // not enabled until the provider's exact verification method
  // is configured.
  return NextResponse.json({
    received: true,
    event,
    transactionId: data.id,
    reference: data.external_reference,
    processing: false
  });
}
