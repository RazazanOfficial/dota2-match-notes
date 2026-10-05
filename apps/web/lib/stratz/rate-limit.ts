import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  externalApiDailyUsage,
  externalApiRateLimits,
} from "../db/schema";

const STRATZ_SLOT_KEY = "stratz:request-slot";

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function nextStratzReservationAt(
  now: Date,
  previousReservation: Date | null,
  minIntervalMs: number,
) {
  if (!previousReservation) return now;
  const next = previousReservation.getTime() + minIntervalMs;
  return new Date(Math.max(now.getTime(), next));
}

export async function reserveStratzRequestSlot(minIntervalMs: number) {
  const now = new Date();
  const utcDay = now.toISOString().slice(0, 10);
  const reservedAt = await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('external-api:stratz', 0))`,
    );
    const [current] = await tx
      .select({ reservedAt: externalApiRateLimits.windowStartedAt })
      .from(externalApiRateLimits)
      .where(eq(externalApiRateLimits.key, STRATZ_SLOT_KEY))
      .limit(1);
    const reservation = nextStratzReservationAt(
      now,
      current?.reservedAt || null,
      minIntervalMs,
    );

    await tx
      .insert(externalApiRateLimits)
      .values({
        key: STRATZ_SLOT_KEY,
        windowStartedAt: reservation,
        requestCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: externalApiRateLimits.key,
        set: {
          windowStartedAt: reservation,
          requestCount: sql`${externalApiRateLimits.requestCount} + 1`,
          updatedAt: now,
        },
      });

    await tx
      .insert(externalApiDailyUsage)
      .values({
        provider: "stratz",
        day: utcDay,
        requestCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [externalApiDailyUsage.provider, externalApiDailyUsage.day],
        set: {
          requestCount: sql`${externalApiDailyUsage.requestCount} + 1`,
          updatedAt: now,
        },
      });

    return reservation;
  });

  const waitMs = reservedAt.getTime() - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  return reservedAt;
}
