
const PALPLUSS_BASE_URL = "https://api.palpluss.com/v1";

function getAuthHeader() {
  const apiKey = process.env.PALPLUSS_API_KEY;

  if (!apiKey) {
    throw new Error("Palpluss API key is not configured");
  }

  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

export async function initiatePalplussStk(input: {
  amountCents: number;
  phone: string;
  reference: string;
  description?: string;
}) {
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 100
  ) {
    throw new Error("Invalid deposit amount");
  }

  const channelId = process.env.PALPLUSS_CHANNEL_ID;

  const response = await fetch(`${PALPLUSS_BASE_URL}/payments/stk`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountCents / 100,
      phone: input.phone,
      accountReference: input.reference,
      transactionDesc: input.description ?? "AUREVEX wallet deposit",
      ...(channelId ? { channelId } : {}),
    }),
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok || result.success !== true) {
    throw new Error("Palpluss payment request failed");
  }

  const transactionId = result.data?.transactionId;

  if (!transactionId) {
    throw new Error("Palpluss returned no transaction ID");
  }

  return {
    transactionId: String(transactionId),
    status: String(result.data?.status ?? "PENDING"),
  };
}

export async function getPalplussTransaction(
  transactionId: string
) {
  if (!/^[0-9a-f-]{36}$/i.test(transactionId)) {
    throw new Error("Invalid Palpluss transaction ID");
  }

  const response = await fetch(
    `${PALPLUSS_BASE_URL}/transactions/${encodeURIComponent(transactionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const result = await response.json();

  if (!response.ok || result.success !== true || !result.data) {
    throw new Error("Unable to verify Palpluss transaction");
  }

  return result.data;
}
