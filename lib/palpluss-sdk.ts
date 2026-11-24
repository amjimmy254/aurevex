import "server-only";
import { PalPluss } from "@palpluss/sdk";

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
