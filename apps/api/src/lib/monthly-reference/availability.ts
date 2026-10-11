const PENDING_PREFIX = "آمار هفتگی Meta مرجع ";
export const META_SOURCE_RECHECK_MS = 60 * 60 * 1000;

export class MonthlyMetaPendingError extends Error {
  readonly code = "monthly_meta_pending";
  constructor(readonly referenceMonth: string, readonly availableWeeks: string[], readonly missingWeeks: string[] = [], readonly position?: number) {
    super(`${PENDING_PREFIX}${referenceMonth.slice(0, 7)} کامل نیست${position ? `؛ پوزیشن ${position}` : ""}؛ هفته‌های غایب: ${missingWeeks.join("، ") || "نامشخص"}؛ آخرین هفتهٔ برگشتی: ${availableWeeks.at(-1) || "نامشخص"}. بررسی مجدد یک ساعت دیگر انجام می‌شود.`);
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
