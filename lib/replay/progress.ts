export type ReplayProgress = {
  phase: string; bytes: number; totalBytes: number | null; bytesPerSecond: number;
  attempts: number; nextTryAt: string | null; phaseStartedAt: string | null;
  heartbeatAt: string | null; retryDeadlineAt: string | null; errorCode: string | null;
};
export const replayPhaseLabels: Record<string, string> = {
  queued: "منتظر شروع", checking_archive: "بررسی آرشیو Replay", resolving_metadata: "دریافت اطلاعات Replay", restoring_archive: "دریافت از آرشیو",
  connecting: "اتصال به سرور Replay", downloading: "دانلود Replay", validating: "بررسی فایل دریافت‌شده",
  parsing: "تحلیل Replay", uploading: "ذخیره در آرشیو", retry_wait: "منتظر تلاش مجدد",
  completed: "آماده", failed: "درخواست تکمیل نشد",
};
export function replayErrorMessage(code: string | null | undefined) {
  if (!code) return "";
  if (code === "replay_retry_exhausted") return "مهلت تلاش خودکار تمام شد؛ می‌توانید دوباره درخواست دهید.";
  if (code === "replay_not_found") return "فایل Replay فعلاً از سرور بازی دریافت نشد.";
  if (code === "replay_metadata_pending") return "اطلاعات دانلود Replay هنوز در OpenDota آماده نیست؛ سرویس دوباره بررسی می‌کند.";
  if (code === "replay_metadata_rate_limited" || code === "replay_metadata_unavailable") return "دریافت اطلاعات Replay موقتاً ممکن نیست؛ سرویس دوباره تلاش می‌کند.";
  if (code.includes("disk")) return "فضای پردازش سرور موقتاً کافی نیست؛ درخواست در صف می‌ماند.";
  if (code.includes("archive")) return "ارتباط با آرشیو موقتاً مشکل دارد؛ مرحلهٔ ذخیره‌سازی دوباره امتحان می‌شود.";
  if (code.includes("parser")) return "خواندن این Replay موفق نبود؛ جزئیات برای مدیر ثبت شده است.";
  if (code.includes("auth") || code.includes("config")) return "تنظیمات سرویس نیاز به بررسی مدیر دارد.";
  return "دریافت Replay موقتاً مشکل دارد؛ وضعیت تلاش بعدی در همین بخش نمایش داده می‌شود.";
}
export function progressFromRow(row: {
  phase?: string | null; downloadedBytes?: number | null; totalBytes?: number | null;
  downloadBps?: number | null; attempts?: number | null; runAfter?: Date | null;
  phaseStartedAt?: Date | null; heartbeatAt?: Date | null; retryDeadlineAt?: Date | null; errorCode?: string | null;
}): ReplayProgress {
  return { phase: row.phase || "queued", bytes: row.downloadedBytes || 0, totalBytes: row.totalBytes ?? null,
    bytesPerSecond: row.downloadBps || 0, attempts: row.attempts || 0, nextTryAt: row.runAfter?.toISOString() || null,
    phaseStartedAt: row.phaseStartedAt?.toISOString() || null, heartbeatAt: row.heartbeatAt?.toISOString() || null,
    retryDeadlineAt: row.retryDeadlineAt?.toISOString() || null, errorCode: row.errorCode || null };
}
