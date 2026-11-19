import { createHmac, timingSafeEqual } from "crypto";

const CYZORA_BASE_URL = "https://api.cyzora.co.ke/api/v1";

function getSecretKey(): string {
  const key = process.env.CYZORA_SECRET_KEY;

  if (!key || !key.startsWith("sk_test_")) {
    throw new Error(
      "Cyzora test API key is missing or invalid."
    );
  }

  return key;
}

export async function cyzoraRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    idempotencyKey?: string;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "X-API-Key": getSecretKey(),
    "Content-Type": "application/json",
  };

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(
    `${CYZORA_BASE_URL}${endpoint}`,
    {
      method: options.method ?? "GET",
      headers,
      body: options.body
        ? JSON.stringify(options.body)
        : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    }
  );

  const responseText = await response.text();

  let data: unknown;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error("Cyzora returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      `Cyzora request failed (${response.status}): ${
        typeof data === "object" && data !== null
          ? JSON.stringify(data)
          : responseText
      }`
    );
  }

  return data as T;
}

export function verifyCyzoraSignature(
  rawBody: string,
  signature: string | null
): boolean {
  const secret = process.env.CYZORA_WEBHOOK_SECRET;

  if (
    !secret ||
    !secret.startsWith("whsec_") ||
    !signature ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  ) {
    return false;
  }

  try {
    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest();

    const received = Buffer.from(signature, "hex");

    return (
      received.length === expected.length &&
      timingSafeEqual(received, expected)
    );
  } catch {
    return false;
  }
}

export function isValidCyzoraAmount(
  amount: unknown,
  minimumCents = 100
): amount is number {
  return (
    typeof amount === "number" &&
    Number.isSafeInteger(amount) &&
    amount >= minimumCents &&
    amount % 100 === 0
  );
}

export function normalizeKenyanPhone(
  phone: unknown
): string | null {
  if (typeof phone !== "string") return null;

  const cleaned = phone.replace(/[\s\-+()]/g, "");

  let normalized = cleaned;

  if (/^0[17]\d{8}$/.test(cleaned)) {
    normalized = `254${cleaned.slice(1)}`;
  }

  if (/^7\d{8}$/.test(cleaned)) {
    normalized = `254${cleaned}`;
  }

  if (/^1\d{8}$/.test(cleaned)) {
    normalized = `254${cleaned}`;
  }

  return /^254[17]\d{8}$/.test(normalized)
    ? normalized
    : null;
}
