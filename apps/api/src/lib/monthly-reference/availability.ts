const PENDING_PREFIX = "آمار Meta ماه ";
export const META_SOURCE_RECHECK_MS = 60 * 60 * 1000;

export class MonthlyMetaPendingError extends Error {
  readonly code = "monthly_meta_pending";
  constructor(readonly referenceMonth: string, readonly availableMonths: string[]) {
    super(`${PENDING_PREFIX}${referenceMonth.slice(0, 7)} در پاسخ STRATZ موجود نیست؛ آخرین ماه برگشتی: ${availableMonths.at(-1)?.slice(0, 7) || "نامشخص"}. بررسی مجدد یک ساعت دیگر انجام می‌شود.`);
    this.name = "MonthlyMetaPendingError";
  }
}

// Persist the existing human-readable Meta error and its timestamp; no schema change.
// Only this specific source-availability state gets an hourly cooldown.
export function pendingMetaRetryAt(message: string | null, recordedAt: Date | null, now: Date) {
  if (!message?.startsWith(PENDING_PREFIX) || !recordedAt) return null;
  const retryAt = new Date(recordedAt.getTime() + META_SOURCE_RECHECK_MS);
  return Number.isFinite(retryAt.getTime()) && retryAt > now ? retryAt : null;
}
