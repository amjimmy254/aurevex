import { createHmac } from "node:crypto";

const HOUR_MS = 60 * 60 * 1000;
const EVENT_DURATION_MS = 7 * 60 * 1000;

export type HourlyEvent = {
  active: boolean;
  startsAt: string;
  endsAt: string;
  remainingSeconds: number;
};

function getHourlyStart(hourStart: number, secret: string): number {
  const digest = createHmac("sha256", secret)
    .update(`aurevex-event:${hourStart}`)
    .digest();

  const maxOffsetSeconds = 53 * 60;
  const offsetSeconds =
    digest.readUInt32BE(0) % (maxOffsetSeconds + 1);

  return hourStart + offsetSeconds * 1000;
}

export function getHourlyEvent(
  now = Date.now()
): HourlyEvent {
  const secret = process.env.AUREVEX_EVENT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("Hourly event secret is not configured.");
  }

  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const startsAt = getHourlyStart(hourStart, secret);
  const endsAt = startsAt + EVENT_DURATION_MS;

  const active = now >= startsAt && now < endsAt;

  return {
    active,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    remainingSeconds: active
      ? Math.ceil((endsAt - now) / 1000)
      : 0
  };
}
