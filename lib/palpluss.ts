const PALPLUSS_BASE_URL = "https://api.palpluss.com/v1";

// Keep live payments disabled until approval and compliance review.
const PALPLUSS_LIVE_PAYMENTS_ENABLED = false;

export type PalplussStkRequest = {
  phone: string;
  amount: number;
  accountReference: string;
  callbackUrl: string;
};

export type PalplussStkResponse = {
  id?: string;
  transactionId?: string;
  status?: string;
  [key: string]: unknown;
};

function getCredentials() {
  const apiKey = process.env.PALPLUSS_API_KEY;
  const channelId = process.env.PALPLUSS_CHANNEL_ID;

  if (!apiKey || !channelId) {
    throw new Error("Palpluss credentials are not configured.");
  }

  return { apiKey, channelId };
}

export async function createPalplussStkPush(
  input: PalplussStkRequest
): Promise<PalplussStkResponse> {
  if (!PALPLUSS_LIVE_PAYMENTS_ENABLED) {
    throw new Error(
      "Palpluss payments are disabled until approval and compliance review are complete."
    );
  }

  const { apiKey, channelId } = getCredentials();

  if (
    !/^254[17]\d{8}$/.test(input.phone) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    !/^[A-Za-z0-9_-]{4,80}$/.test(input.accountReference)
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
      accountReference: input.accountReference,
      callbackUrl: input.callbackUrl,
      channelId,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  const responseText = await response.text();
  let data: unknown;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error("Palpluss returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(`Palpluss request failed (${response.status}).`);
  }

  if (typeof data !== "object" || data === null) {
    throw new Error("Palpluss returned an unexpected response.");
  }

  return data as PalplussStkResponse;
}
