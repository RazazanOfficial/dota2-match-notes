"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { heroById, heroImage } from "@/data/heroes";
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
  if (job.status === "processing") return "در حال آماده‌سازی";
  return `نوبت ${faNumber.format(job.position || 1)} در صف`;
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
      setError(reason instanceof Error ? reason.message : "وضعیت مچ‌ها دریافت نشد");
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
    return status.imageQueue.jobs
      .filter((job) => job.status === "pending" || job.status === "processing")
      .sort((left, right) => (left.position || Number.MAX_SAFE_INTEGER) - (right.position || Number.MAX_SAFE_INTEGER));
  }, [status]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const result = await syncPlayerMatches();
      onMatchesImported(result);
      const enriched =
        result.stratz?.jobs.filter((job) => job.status === "completed").length || 0;
      const pendingEnrichment =
        result.stratz?.jobs.filter((job) => job.status === "pending").length || 0;
      const failedEnrichment =
        result.stratz?.jobs.filter((job) => job.status === "failed").length || 0;
      if (result.imported.length) {
        setMessage(
          `${faNumber.format(result.imported.length)} مچ تازه به دفترت اضافه شد.`,
        );
      } else if (enriched) {
        setMessage(`اطلاعات ${faNumber.format(enriched)} مچ کامل شد.`);
      } else {
        setMessage("مچ تازه‌ای برای اضافه‌شدن پیدا نشد.");
      }
      if (result.stratz?.backfillQueued) {
        setMessage((current) =>
          `${current} اطلاعات ${faNumber.format(result.stratz?.backfillQueued || 0)} مچ قبلی در حال تکمیل است.`,
        );
      } else if (result.imported.length && enriched) {
        setMessage((current) =>
          `${current} اطلاعات ${faNumber.format(enriched)} مچ کامل شد.`,
        );
      }
      if (result.deferred) {
        setMessage((current) =>
          `${current} ${faNumber.format(result.deferred)} مچ دیگر با بررسی بعدی اضافه می‌شود.`,
        );
      }
      if (pendingEnrichment) {
        setMessage((current) =>
          `${current} اطلاعات ${faNumber.format(pendingEnrichment)} مچ هنوز در حال تکمیل است.`,
        );
      }
      if (failedEnrichment) {
        setMessage((current) =>
          `${current} اطلاعات ${faNumber.format(failedEnrichment)} مچ هنوز کامل نشده است.`,
        );
      }
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "مچ‌ها به‌روز نشدند");
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="sync-panel" aria-labelledby="sync-panel-title">
      <div className="sync-panel-copy">
        <p className="week-kicker">RECENT MATCHES</p>
        <h2 id="sync-panel-title">تازه‌ترین مچ‌هایت</h2>
        <p>
          آخرین بازی‌هایت را به دفتر اضافه کن و برای مرور بعدی آماده نگه دار.
        </p>
        <div className="sync-meta">
          <span>آخرین بررسی: <b>{formatTime(status?.lastSyncAt || null)}</b></span>
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
            ? "در حال بررسی"
            : cooldownSeconds
              ? `${faNumber.format(cooldownSeconds)} ثانیه تا بررسی بعدی`
              : "به‌روزرسانی مچ‌ها"}
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
              <span>در حال آماده‌سازی</span>
              <strong>
                {faNumber.format(
                  (status?.imageQueue.counts.pending || 0) +
                    (status?.imageQueue.counts.processing || 0),
                )} مچ
              </strong>
            </div>
          </div>
          <div className="image-queue-list">
            {visibleJobs.map((job) => {
              const hero = job.heroId ? heroById(job.heroId) : undefined;
              return (
                <article className={`queue-job is-${job.status}`} key={job.id}>
                  <span className="queue-job-portrait">
                    {hero ? <img src={heroImage(hero)} alt="" /> : <span aria-hidden="true">?</span>}
                  </span>
                  <div className="queue-job-copy">
                    <strong lang="en" dir="ltr">{job.heroName || "Dota 2 Match"}</strong>
                    <span lang="en" dir="ltr">Match #{job.dotaMatchId || "—"}</span>
                  </div>
                  <span className="queue-job-position">{queueLabel(job)}</span>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
