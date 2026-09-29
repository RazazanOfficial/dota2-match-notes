"use client";
import { useEffect, useState } from "react";
import { replayErrorMessage, replayPhaseLabels, type ReplayProgress } from "@/lib/replay/progress";
import styles from "./replay-progress.module.css";
const mb = (value: number) => `${(value / 1048576).toFixed(1)} MB`;
export default function ReplayProgressView({ progress }: { progress: ReplayProgress | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!progress || ["completed", "failed"].includes(progress.phase)) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setNow(Date.now()); }, 1000);
    return () => window.clearInterval(timer);
  }, [progress?.phase]);
  if (!progress) return null;
  const downloading = progress.phase === "downloading";
  const percent = downloading && progress.totalBytes ? Math.min(100, Math.floor(progress.bytes / progress.totalBytes * 100)) : null;
  const wait = progress.nextTryAt ? Math.max(0, Math.ceil((Date.parse(progress.nextTryAt) - now) / 1000)) : null;
  const elapsed = progress.phaseStartedAt ? Math.max(0, Math.floor((now - Date.parse(progress.phaseStartedAt)) / 1000)) : 0;
  return <div className={styles.progress} dir="rtl" role="status">
    <strong>{replayPhaseLabels[progress.phase] || "آماده‌سازی Replay"}</strong>
    {downloading && <><span dir="ltr">{mb(progress.bytes)}{progress.totalBytes ? ` / ${mb(progress.totalBytes)} · ${percent}%` : ""}</span>
      {percent !== null && <progress value={percent} max={100} aria-label="پیشرفت دانلود" />}
      {progress.bytesPerSecond > 0 && <small dir="ltr">{mb(progress.bytesPerSecond)}/s</small>}</>}
    {progress.phase === "retry_wait" ? <small>{wait && wait > 0 ? `تلاش بعدی تا ${Math.ceil(wait / 60)} دقیقه` : "منتظر نوبت اجرای سرویس"} · نوبت {progress.attempts}</small>
      : !["completed", "failed", "queued"].includes(progress.phase) && <small>{elapsed} ثانیه از شروع این مرحله گذشته</small>}
    {progress.errorCode && ["retry_wait", "failed"].includes(progress.phase) && <small>{replayErrorMessage(progress.errorCode)}</small>}
  </div>;
}
