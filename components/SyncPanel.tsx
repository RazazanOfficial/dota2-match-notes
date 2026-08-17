"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getPlayerSyncStatus, syncPlayerMatches } from "@/lib/api";
import { faNumber } from "@/lib/date";
import type { ImageQueueJob, ManualSyncResult, PlayerSyncStatus } from "@/lib/types";

const faDateTime = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTime(value: string | null) {
  return value ? faDateTime.format(new Date(value)) : "هنوز انجام نشده";
}

function queueLabel(job: ImageQueueJob) {
  if (job.status === "processing") return "در حال ساخت تصاویر";
  if (job.status === "pending") {
    return `نفر ${faNumber.format(job.position || 1)} در صف`;
  }
  if (job.status === "failed") return "ساخت تصویر ناموفق";
  return `${faNumber.format(job.imageCount)} تصویر آماده`;
}

export default function SyncPanel({
  onMatchesImported,
}: {
  onMatchesImported: (result: ManualSyncResult) => void;
}) {
  const [status, setStatus] = useState<PlayerSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const loadStatus = useCallback(async () => {
    try {
      const next = await getPlayerSyncStatus();
      setStatus(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "وضعیت صف دریافت نشد");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const active = Boolean(
      status &&
        (status.imageQueue.counts.pending || status.imageQueue.counts.processing),
    );
    const timer = window.setInterval(() => void loadStatus(), active ? 3_000 : 15_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, status]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const cooldownSeconds = status?.nextAllowedAt
    ? Math.max(0, Math.ceil((new Date(status.nextAllowedAt).getTime() - now) / 1_000))
    : 0;
  const visibleJobs = useMemo(() => {
    if (!status) return [];
    const active = status.imageQueue.jobs.filter(
      (job) => job.status === "pending" || job.status === "processing" || job.status === "failed",
    );
    if (active.length) return active.slice(0, 8);
    return status.imageQueue.jobs
      .filter((job) => job.status === "completed")
      .slice(0, 3);
  }, [status]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const result = await syncPlayerMatches();
      onMatchesImported(result);
      if (result.imported.length) {
        setMessage(
          `${faNumber.format(result.imported.length)} مچ جدید ثبت شد و برای ساخت تصاویر وارد صف شد.`,
        );
      } else {
        setMessage("مچ جدیدی از زمان آخرین بررسی پیدا نشد.");
      }
      if (result.deferred) {
        setMessage((current) =>
          `${current} ${faNumber.format(result.deferred)} مچ دیگر برای Sync بعدی باقی ماند.`,
        );
      }
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "همگام‌سازی انجام نشد");
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="sync-panel" aria-labelledby="sync-panel-title">
      <div className="sync-panel-copy">
        <p className="week-kicker">OPEN DOTA SYNC</p>
        <h2 id="sync-panel-title">دریافت مچ‌های جدید</h2>
        <p>
          مچ‌ها از زمان عضویت شما بررسی می‌شوند. پس از ثبت، ساخت سه تصویر در صف سرور انجام می‌شود.
        </p>
        <div className="sync-meta">
          <span>آخرین بررسی: <b>{formatTime(status?.lastSyncAt || null)}</b></span>
          {status?.registeredAt && (
            <span>شروع ردیابی: <b>{formatTime(status.registeredAt)}</b></span>
          )}
        </div>
      </div>
      <div className="sync-panel-action">
        <button
          className="sync-button"
          type="button"
          disabled={syncing || cooldownSeconds > 0}
          onClick={handleSync}
        >
          <span className={syncing ? "sync-spinner" : "sync-button-icon"}>↻</span>
          {syncing
            ? "در حال بررسی مچ‌ها"
            : cooldownSeconds
              ? `${faNumber.format(cooldownSeconds)} ثانیه تا بررسی بعدی`
              : "بررسی مچ‌های جدید"}
        </button>
        {(message || error) && (
          <p className={`sync-feedback${error ? " is-error" : ""}`} role="status">
            {error || message}
          </p>
        )}
      </div>

      {visibleJobs.length > 0 && (
        <div className="image-queue" aria-live="polite">
          <div className="image-queue-heading">
            <div>
              <span>صف تولید تصاویر</span>
              <strong>
                {faNumber.format(
                  (status?.imageQueue.counts.pending || 0) +
                    (status?.imageQueue.counts.processing || 0),
                )} کار فعال
              </strong>
            </div>
            <span className="queue-live-dot">به‌روزرسانی زنده</span>
          </div>
          <div className="image-queue-list">
            {visibleJobs.map((job) => (
              <article className={`queue-job is-${job.status}`} key={job.id}>
                <div>
                  <strong lang="en" dir="ltr">{job.heroName || `Match ${job.dotaMatchId || ""}`}</strong>
                  <span lang="en" dir="ltr">#{job.dotaMatchId || "—"}</span>
                </div>
                <span>{queueLabel(job)}</span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
