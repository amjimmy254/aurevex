const PALPLUSS_BASE_URL = "https://api.palpluss.com/v1";

// Hard-disabled until provider approval and compliance review.
const PALPLUSS_LIVE_PAYMENTS_ENABLED = false;

export type PalplussStkRequest = {
  phone: string;
  amount: number; // KES, not cents
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

function getCredentials() {
  const apiKey = process.env.PALPLUSS_API_KEY;
  const channelId = process.env.PALPLUSS_CHANNEL_ID;

  if (!apiKey) {
    throw new Error("Palpluss API key is not configured.");
  }

  return { apiKey, channelId };
}

export async function createPalplussStkPush(
  input: PalplussStkRequest
): Promise<PalplussStkResponse> {
  if (!PALPLUSS_LIVE_PAYMENTS_ENABLED) {
    throw new Error(
      "Palpluss payments are disabled until provider approval and compliance review are complete."
    );
  }

  const { apiKey, channelId } = getCredentials();
  const accountReference = input.accountReference ?? "AUREVEX";
  const transactionDesc = input.transactionDesc ?? "AUREVEX deposit";

  if (
    !/^254[17]\d{8}$/.test(input.phone) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount < 1 ||
    accountReference.length > 120 ||
    transactionDesc.length > 255 ||
    (input.callbackUrl !== undefined &&
      (!input.callbackUrl.startsWith("https://") ||
        input.callbackUrl.length > 500))
  ) {
    throw new Error("Invalid Palpluss STK Push details.");
  }

  const response = await fetch(`${PALPLUSS_BASE_URL}/payments/stk`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: input.phone,
      amount: input.amount,
      accountReference,
      transactionDesc,
      ...(channelId ? { channelId } : {}),
      ...(input.callbackUrl ? { callbackUrl: input.callbackUrl } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  const responseText = await response.text();
  let envelope: unknown;

  try {
    envelope = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error("Palpluss returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(`Palpluss request failed (${response.status}).`);
  }

  if (
    typeof envelope !== "object" ||
    envelope === null ||
    !("data" in envelope) ||
    typeof envelope.data !== "object" ||
    envelope.data === null
  ) {
    throw new Error("Palpluss returned an unexpected response.");
  }

  return envelope.data as PalplussStkResponse;
}
