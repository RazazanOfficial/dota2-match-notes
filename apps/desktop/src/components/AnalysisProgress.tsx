import type { ReplayProgress } from "@/lib/replay/progress";
import type { Messages } from "../i18n";

const phaseIndex: Record<string, number> = {
    queued: 0, checking_archive: 1, resolving_metadata: 1, restoring_archive: 1, connecting: 1,
    downloading: 2, validating: 2, parsing: 3, uploading: 4, completed: 5,
};
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export function AnalysisProgress({ preparation, t }: {
    preparation: { replay: string; progress?: ReplayProgress | null; errorCode?: string | null } | null;
    t: Messages;
}) {
    if (!preparation || preparation.replay === "basic" || preparation.replay === "expired") return null;
    const progress = preparation.progress;
    const phase = progress?.phase || (preparation.replay === "failed" ? "failed" : "queued");
    const active = phaseIndex[phase] ?? (phase === "retry_wait" ? 1 : 0);
    const stages = [t.analysisQueued, t.analysisConnect, t.analysisDownload, t.analysisParse, t.analysisSave];
    const failed = preparation.replay === "failed" || phase === "failed";
    const downloading = phase === "downloading";
    const percent = downloading && progress?.totalBytes ? Math.min(100, Math.max(0, Math.round(progress.bytes / progress.totalBytes * 100))) : null;
    const label = phase === "retry_wait" ? t.analysisRetry : stages[Math.min(active, stages.length - 1)];
    return <div className={`analysis-progress ${failed ? "is-failed" : ""}`} role="status" aria-live="polite">
        <div className="analysis-progress-heading"><strong>{failed ? t.analysisFailed : active === 5 ? t.analysisReady : label}</strong>{!failed && <small>{t.analysisRefresh}</small>}</div>
        <ol className="analysis-steps" dir="ltr">{stages.map((stage, index) => <li key={stage} className={active > index ? "done" : active === index ? "active" : "waiting"}><span>{index + 1}</span><b>{stage}</b></li>)}</ol>
        {downloading && progress && <div className="analysis-transfer"><div><bdi>{t.analysisBytes}: {mb(progress.bytes)}{progress.totalBytes ? ` / ${mb(progress.totalBytes)}` : ""}</bdi><bdi>{percent === null ? t.analysisUnknownSize : `${percent}%`}</bdi></div><progress value={percent ?? undefined} max={100} aria-label={t.analysisDownload}/>{progress.bytesPerSecond > 0 && <small dir="ltr">{mb(progress.bytesPerSecond)}/s</small>}</div>}
        {phase === "retry_wait" && <small>{t.analysisRetry} · {t.analysisAttempts} {progress?.attempts || 1}{progress?.nextTryAt ? ` · ${new Date(progress.nextTryAt).toLocaleTimeString()}` : ""}</small>}
        {failed && <small>{progress?.errorCode || preparation.errorCode || ""}</small>}
    </div>;
}
