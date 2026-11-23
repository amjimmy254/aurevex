const PALPLUSS_BASE_URL = "https://api.palpluss.com/v1";

// Keep live payments disabled until approval and compliance checks are complete.
const PALPLUSS_LIVE_PAYMENTS_ENABLED = false;

type PalplussErrorEnvelope = {
  success?: false;
  error?: {
    message?: string;
    code?: string;
    details?: {
      message?: string;
      code?: string;
      details?: Record<string, unknown>;
    };
  };
  requestId?: string;
};

export class PalplussApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;

  constructor(input: {
    status: number;
    message: string;
    code?: string;
    requestId?: string;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  }) {
    super(input.message);
    this.name = "PalplussApiError";
    this.status = input.status;
    this.code = input.code ?? `HTTP_${input.status}`;
    this.requestId = input.requestId;
    this.details = input.details;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.retryable = input.status === 429 || input.status >= 500;
  }
}

export class PalplussNetworkError extends Error {
  readonly retryable = true;

  constructor(message = "PalPluss network request failed.") {
    super(message);
    this.name = "PalplussNetworkError";
  }
}

function getRetryAfterSeconds(
  response: Response,
  details?: Record<string, unknown>
): number | undefined {
  const providerValue = details?.retryAfterSeconds;

  if (
    typeof providerValue === "number" &&
    Number.isFinite(providerValue) &&
    providerValue >= 0
  ) {
    return Math.ceil(providerValue);
  }

  const header = response.headers.get("Retry-After");
  if (!header) return undefined;

  const seconds = Number(header);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  const dateSeconds = (Date.parse(header) - Date.now()) / 1000;

  return Number.isFinite(dateSeconds) && dateSeconds > 0
    ? Math.ceil(dateSeconds)
    : undefined;
}

async function readPalplussResponse(
  response: Response,
  operation: string
): Promise<unknown> {
  const responseText = await response.text();
  let envelope: unknown;

  try {
    envelope = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (!response.ok) {
      throw new PalplussApiError({
        status: response.status,
        message: `PalPluss ${operation} failed with HTTP ${response.status}.`,
        retryAfterSeconds: getRetryAfterSeconds(response),
      });
    }

    throw new Error(`PalPluss ${operation} returned invalid JSON.`);
  }

  if (!response.ok) {
    const body = envelope as PalplussErrorEnvelope;
    const providerError = body?.error;
    const specificDetails = providerError?.details?.details;
    const specificCode = providerError?.details?.code;

    const error = new PalplussApiError({
      status: response.status,
      message:
        providerError?.details?.message ??
        providerError?.message ??
        `PalPluss ${operation} failed.`,
      code:
        specificCode ??
        providerError?.code ??
        `HTTP_${response.status}`,
      requestId: body?.requestId,
      details: specificDetails,
      retryAfterSeconds: getRetryAfterSeconds(
        response,
        specificDetails
      ),
    });

    console.error("PalPluss API error", {
      operation,
      status: error.status,
      code: error.code,
      requestId: error.requestId,
      retryAfterSeconds: error.retryAfterSeconds,
    });

    throw error;
  }

  return envelope;
}

async function palplussFetch(
  url: string,
  init: RequestInit,
  operation: string
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `PalPluss ${operation} timed out.`
        : `PalPluss ${operation} network request failed.`;

    console.error(message);
    throw new PalplussNetworkError(message);
  }

  return readPalplussResponse(response, operation);
}

function getCredentials() {
  const apiKey = process.env.PALPLUSS_API_KEY;
  const channelId = process.env.PALPLUSS_CHANNEL_ID;

  if (!apiKey) {
    throw new Error("PalPluss API key is not configured.");
  }

  return { apiKey, channelId };
}

export type PalplussStkRequest = {
  phone: string;
  amount: number; // KES, not cents
  idempotencyKey: string;
  accountReference?: string;
  transactionDesc?: string;
  callbackUrl?: string;
};

export type PalplussStkResponse = {
  transactionId?: string;
  status?: string;
  amount?: number;
  currency?: string;
  [key: string]: unknown;
};

export async function createPalplussStkPush(
  input: PalplussStkRequest
): Promise<PalplussStkResponse> {
  if (!PALPLUSS_LIVE_PAYMENTS_ENABLED) {
    throw new Error(
      "PalPluss payments are disabled until provider approval and compliance review are complete."
    );
  }

  const { apiKey, channelId } = getCredentials();

  if (!channelId) {
    throw new Error("PalPluss channel ID is not configured.");
  }

  const accountReference = input.accountReference ?? "AUREVEX";
  const transactionDesc = input.transactionDesc ?? "AUREVEX deposit";

  if (
    !/^254[17]\d{8}$/.test(input.phone) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount < 1 ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(input.idempotencyKey) ||
    accountReference.length > 120 ||
    transactionDesc.length > 255 ||
    (input.callbackUrl !== undefined &&
      (!input.callbackUrl.startsWith("https://") ||
        input.callbackUrl.length > 500))
  ) {
    throw new Error("Invalid PalPluss STK Push details.");
  }

  const envelope = await palplussFetch(
    `${PALPLUSS_BASE_URL}/payments/stk`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "Idempotency-Key": input.idempotencyKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: input.phone,
        amount: input.amount,
        accountReference,
        transactionDesc,
        channelId,
        ...(input.callbackUrl ? { callbackUrl: input.callbackUrl } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
    "STK Push"
  );

  if (
    typeof envelope !== "object" ||
    envelope === null ||
    !("data" in envelope) ||
    typeof envelope.data !== "object" ||
    envelope.data === null
  ) {
    throw new Error("PalPluss returned an unexpected STK response.");
  }

  const stkData = envelope.data as PalplussStkResponse;

  if (
    typeof stkData.transactionId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(stkData.transactionId) ||
    stkData.status !== "PENDING"
  ) {
    throw new Error("PalPluss returned an invalid STK transaction.");
  }

  return stkData;
}

export type PalplussTransaction = {
  transaction_id?: string;
  type?: string;
  status?: string;
  amount?: number;
  currency?: string;
  phone_number?: string;
  external_reference?: string | null;
  provider_request_id?: string | null;
  provider_checkout_id?: string | null;
  mpesa_receipt?: string | null;
  result_desc?: string | null;
  reference?: string | null;
};
export async function getPalplussTransaction(
  transactionId: string
): Promise<PalplussTransaction> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      transactionId
    )
  ) {
    throw new Error("Invalid PalPluss transaction ID.");
  }

  const apiKey = process.env.PALPLUSS_API_KEY;

  if (!apiKey) {
    throw new Error("PalPluss API key is not configured.");
  }

  const envelope = await palplussFetch(
    `${PALPLUSS_BASE_URL}/transactions/${encodeURIComponent(transactionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
    "transaction lookup"
  );

  if (
    typeof envelope !== "object" ||
    envelope === null ||
    !("data" in envelope) ||
    typeof envelope.data !== "object" ||
    envelope.data === null
  ) {
    throw new Error("PalPluss returned an unexpected transaction response.");
  }

  return envelope.data as PalplussTransaction;
}

// Keep B2C payouts disabled until final approval and testing.
const PALPLUSS_B2C_PAYOUTS_ENABLED = false;

export type PalplussB2cPayoutResponse = {
  transactionId?: string;
  type?: string;
  status?: string;
  amount?: number;
  currency?: string;
  phone?: string;
  reference?: string | null;
  [key: string]: unknown;
};

export async function createPalplussB2cPayout(input: {
  phone: string;
  amount: number; // Whole KES
  reference: string;
  idempotencyKey: string;
  callbackUrl: string;
}): Promise<PalplussB2cPayoutResponse> {
  if (!PALPLUSS_B2C_PAYOUTS_ENABLED) {
    throw new Error("PalPluss B2C payouts are disabled.");
  }

  const { apiKey } = getCredentials();

  if (
    !/^254[17]\d{8}$/.test(input.phone) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount < 10 ||
    !input.reference ||
    input.reference.length > 120 ||
    !/^[a-zA-Z0-9_-]{8,120}$/.test(input.idempotencyKey) ||
    !input.callbackUrl.startsWith("https://")
  ) {
    throw new Error("Invalid PalPluss B2C payout details.");
  }

  const envelope = await palplussFetch(
    `${PALPLUSS_BASE_URL}/b2c/payouts`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "Idempotency-Key": input.idempotencyKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amount,
        phone: input.phone,
        currency: "KES",
        reference: input.reference,
        description: "AUREVEX withdrawal",
        callback_url: input.callbackUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
    "B2C payout"
  );

  if (
    typeof envelope !== "object" ||
    envelope === null ||
    !("data" in envelope) ||
    typeof envelope.data !== "object" ||
    envelope.data === null
  ) {
    throw new Error("Unexpected PalPluss B2C response.");
  }

  const payout = envelope.data as PalplussB2cPayoutResponse;

  if (
    typeof payout.transactionId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(payout.transactionId) ||
    payout.type !== "B2C" ||
    payout.status !== "PENDING" ||
    payout.currency !== "KES" ||
    Number(payout.amount) !== input.amount
  ) {
    throw new Error("Invalid PalPluss B2C payout response.");
  }

  return payout;
}
