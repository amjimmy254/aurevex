import "server-only";

import {
  PalPluss,
  type Transaction,
  type TransactionListResponse,
} from "@palpluss/sdk";

let client: PalPluss | null = null;

export function getPalplussClient(): PalPluss {
  if (client) {
    return client;
  }

  const apiKey = process.env.PALPLUSS_API_KEY;

  if (!apiKey) {
    throw new Error("PalPluss API key is not configured.");
  }

  client = new PalPluss({
    apiKey,
    timeout: 30_000,
    autoRetryOnRateLimit: true,
    maxRetries: 3,
  });

  return client;
}

export async function getPalplussSdkTransaction(
  transactionId: string
): Promise<Transaction> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(transactionId)) {
    throw new Error("Invalid PalPluss transaction ID.");
  }

  return getPalplussClient().getTransaction(transactionId);
}

export async function listPalplussTransactions(
  type: "STK" | "B2C",
  cursor?: string
): Promise<TransactionListResponse> {
  return getPalplussClient().listTransactions({
    type,
    limit: 100,
    ...(cursor ? { cursor } : {}),
  });
}

export async function listPalplussB2cTransactions(
  cursor?: string
): Promise<TransactionListResponse> {
  return listPalplussTransactions("B2C", cursor);
}

export async function listPalplussStkTransactions(
  cursor?: string
): Promise<TransactionListResponse> {
  return listPalplussTransactions("STK", cursor);
}
