import type { ReplayProgress } from "@/lib/replay/progress";
import { ChevronUp } from "lucide-react";
import { isPersian, type Messages } from "../i18n";
import { formatClock24, formatCount } from "../time";
import { ErrorNotice } from "./ErrorNotice";

const phaseIndex: Record<string, number> = {
    queued: 0, checking_archive: 1, resolving_metadata: 1, restoring_archive: 1, connecting: 1,
    downloading: 2, validating: 2, parsing: 3, uploading: 4, completed: 5,
};
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export function AnalysisProgress({ preparation, t, compact = false, onCollapse }: {
    preparation: { replay: string; progress?: ReplayProgress | null; errorCode?: string | null } | null;
    t: Messages;
    compact?: boolean;
    onCollapse?: () => void;
}) {
    if (!preparation || preparation.replay === "basic" || preparation.replay === "expired") return null;
    const progress = preparation.progress;
    const phase = progress?.phase || (preparation.replay === "failed" ? "failed" : "queued");
    const code = progress?.errorCode || preparation.errorCode;
    const failed = preparation.replay === "failed" || phase === "failed";
    const failedStage = code?.includes("parser") || code?.startsWith("replay_identity_") ? 3
        : code?.includes("upload") || code?.includes("archive") ? 4
        : code?.includes("download") || code?.includes("checksum") || code?.includes("checkpoint") ? 2 : 1;
    const active = failed ? failedStage : phaseIndex[phase] ?? (phase === "retry_wait" ? 1 : 0);
    const stages = [t.analysisQueued, t.analysisConnect, t.analysisDownload, t.analysisParse, t.analysisSave];
    const downloading = phase === "downloading";
    const percent = downloading && progress?.totalBytes ? Math.min(100, Math.max(0, Math.round(progress.bytes / progress.totalBytes * 100))) : null;
    const label = phase === "retry_wait" ? t.analysisRetry : stages[Math.min(active, stages.length - 1)];
    return <div className={`analysis-progress ${compact ? "is-compact" : ""} ${failed ? "is-failed" : ""} ${phase === "retry_wait" ? "is-retrying" : ""}`} role="status" aria-live="polite">
        <div className="analysis-progress-heading"><span className="progress-signal" title={phase === "retry_wait" && progress?.nextTryAt ? `${t.nextRetryTime}: ${formatClock24(progress.nextTryAt,t)}` : failed ? t.analysisFailed : t.analysisRefresh}><i className={`signal-dot ${failed ? "signal-error" : phase === "retry_wait" ? "signal-retry" : ""}`}/>{phase === "retry_wait" && <small>{t.retryShort} <bdi>{formatCount(progress?.attempts || 1,t)}</bdi></small>}</span>{!compact && <strong>{failed ? t.analysisFailed : active === 5 ? t.analysisReady : label}</strong>}{onCollapse && <button className="progress-collapse" onClick={onCollapse} aria-label={t.collapseProgress}><ChevronUp size={19}/></button>}</div>
        <ol className="analysis-steps" dir="ltr">{stages.map((stage, index) => <li key={stage} aria-current={active === index ? "step" : undefined} className={active > index ? "done" : active === index ? failed ? "failed" : "active" : "waiting"}><span>{index + 1}</span><b className={compact && index === 0 ? "sr-only" : ""}>{stage}</b></li>)}</ol>
        {downloading && progress && <div className="analysis-transfer"><div><bdi>{t.analysisBytes}: {mb(progress.bytes)}{progress.totalBytes ? ` / ${mb(progress.totalBytes)}` : ""}</bdi><bdi>{percent === null ? t.analysisUnknownSize : `${percent}%`}</bdi></div><progress value={percent ?? undefined} max={100} aria-label={t.analysisDownload}/>{progress.bytesPerSecond > 0 && <small dir="ltr">{mb(progress.bytesPerSecond)}/s</small>}</div>}
        {!compact && phase === "retry_wait" && <small className="analysis-retry-details">{t.analysisRetry}{isPersian(t) ? " — " : " · "}{t.analysisAttempts}{isPersian(t) ? ": " : " "}<bdi>{formatCount(progress?.attempts || 1, t)}</bdi>{progress?.nextTryAt && <>{isPersian(t) ? ` — ${t.nextRetryTime}: ` : " · "}<time dateTime={progress.nextTryAt}><bdi dir="ltr">{formatClock24(progress.nextTryAt, t)}</bdi></time></>}</small>}
        {failed && <ErrorNotice code={code} title={`${t.analysisFailed} · ${stages[failedStage]}`} t={t}/>}
        {!compact && !failed && phase === "retry_wait" && code && <ErrorNotice code={code} title={t.analysisRetry} t={t}/>}
    </div>;
}
