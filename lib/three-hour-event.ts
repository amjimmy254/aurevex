import { createHmac } from "node:crypto";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const EVENT_DURATION_MS = 30 * 1000;

export function isThreeHourEventActive(
  now = Date.now()
): boolean {
  const secret = process.env.AUREVEX_EVENT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("Event secret is not configured.");
  }

  const periodStart =
    Math.floor(now / THREE_HOURS_MS) * THREE_HOURS_MS;

  const digest = createHmac("sha256", secret)
    .update(`aurevex-three-hour-event:${periodStart}`)
    .digest();

  const maxOffsetSeconds =
    (THREE_HOURS_MS - EVENT_DURATION_MS) / 1000;

  const offsetSeconds =
    digest.readUInt32BE(0) % (maxOffsetSeconds + 1);

  const startsAt =
    periodStart + offsetSeconds * 1000;

  const endsAt = startsAt + EVENT_DURATION_MS;

  return now >= startsAt && now < endsAt;
}
