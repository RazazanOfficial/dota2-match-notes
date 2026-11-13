import type { CSSProperties } from "react";
import type { ReplayProgress } from "@/lib/replay/progress";
import { Activity, Check, ChevronUp, Clock3, Download, Radio } from "lucide-react";
import { isPersian, type Messages } from "../i18n";
import { formatClock24, formatCount } from "../time";
import { ErrorNotice, friendlyError } from "./ErrorNotice";
import "./analysis-progress.css";

const phaseIndex: Record<string, number> = {
    queued: 1, checking_archive: 1, resolving_metadata: 1, connecting: 1,
    restoring_archive: 2, downloading: 2, validating: 2, awaiting_parse: 3, parsing: 3,
    completed: 5,
};

// Retry snapshots do not retain the failed phase. Infer only codes whose stage is known.
function errorStage(code: string | null | undefined) {
    if (code?.includes("parser") || code?.startsWith("replay_identity_") || code === "analysis_failed") return 3;
    if (code === "replay_not_found" || code === "replay_archive_check_failed" || code?.includes("metadata") || code?.includes("connect")) return 1;
    if (code?.includes("download") || code?.includes("checksum") || code?.includes("checkpoint") || code?.includes("archive_restore")
        || code?.startsWith("replay_body_") || ["replay_payload_invalid", "replay_range_invalid", "replay_size_invalid", "replay_too_large"].includes(code || "")) return 2;
    return null;
}

const mb = (bytes: number) => `${(Math.max(0, Number.isFinite(bytes) ? bytes : 0) / 1048576).toFixed(1)} MiB`;

function Liquid({ level }: { level: number }) {
    return <span className="analysis-liquid" style={{ "--liquid-level": `${level}%` } as CSSProperties} aria-hidden="true">
        <svg className="analysis-wave analysis-wave-back" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 9 C12 4 23 5 34 9 S56 14 66 10 S88 4 100 9 S123 15 134 10 S155 4 166 9 S188 14 200 9 V20 H0Z"/></svg>
        <svg className="analysis-wave analysis-wave-front" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 C9 13 18 14 28 9 S46 5 58 10 S81 14 100 10 S119 5 128 9 S147 14 158 10 S181 5 200 10 V20 H0Z"/></svg>
    </span>;
}

export function AnalysisProgress({ preparation, t, compact = false, onCollapse, queue }: {
    preparation: { replay: string; progress?: ReplayProgress | null; errorCode?: string | null } | null;
    t: Messages;
    compact?: boolean;
    onCollapse?: () => void;
    queue?: { queueLane?: "prepare" | "parse" | null; queuePosition?: number | null; activeCount?: number | null } | null;
}) {
    if (!preparation || preparation.replay === "basic" || preparation.replay === "expired") return null;
    const fa = isPersian(t);
    const progress = preparation.progress;
    const phase = progress?.phase || (preparation.replay === "failed" ? "failed" : "queued");
    const code = progress?.errorCode || preparation.errorCode;
    const ready = preparation.replay === "ready" || preparation.replay === "completed" || phase === "completed";
    const failed = !ready && (preparation.replay === "failed" || phase === "failed");
    const retry = !ready && phase === "retry_wait";
    const inferred = errorStage(code);
    // Unknown terminal errors must not claim an arbitrary preparation stage failed.
    const active = ready ? 5 : failed || retry ? inferred : phaseIndex[phase] ?? null;
    const stages = [t.analysisRegistered, t.analysisConnect, t.analysisDownload, t.analysisParse, t.analysisReadyStep];
    const downloading = !failed && !retry && !ready && phase === "downloading";
    const total = progress?.totalBytes;
    const percent = downloading && total != null && Number.isFinite(total) && total > 0 && Number.isFinite(progress?.bytes)
        ? Math.min(100, Math.max(0, Math.round(progress!.bytes / total * 100))) : null;
    const progressing = !failed && !retry && !ready && ["checking_archive", "resolving_metadata", "connecting", "restoring_archive", "downloading", "validating", "parsing"].includes(phase);
    const label = ready ? t.analysisReady : failed ? t.analysisFailed : retry ? code?.includes("metadata") || code === "replay_not_found" ? (fa ? "در انتظار اطلاعات ریپلی" : "Waiting for replay details") : t.analysisRetry
        : phase === "awaiting_parse" ? t.analysisAwaitingParse : phase === "uploading" ? t.analysisArchiving
        : active === null ? t.analysisRefresh : stages[Math.min(active, 4)];
    const queued = !failed && !retry && !ready && (phase === "queued" || phase === "awaiting_parse")
        && queue?.queueLane === (phase === "queued" ? "prepare" : "parse")
        && Number.isInteger(queue.queuePosition) && (queue.queuePosition ?? 0) > 0;
    const queueText = queued ? fa
        ? `نوبت ${formatCount(queue!.queuePosition!, t)} در صف ${queue!.queueLane === "parse" ? "تحلیل" : "آماده‌سازی"}`
        : `Position ${formatCount(queue!.queuePosition!, t)} in the ${queue!.queueLane === "parse" ? "analysis" : "preparation"} queue` : null;
    const requestKey = progress?.requestStartedAt || "current";

    return <div className={`analysis-progress analysis-progress-liquid ${compact ? "is-compact" : ""} ${failed ? "is-failed" : ""} ${retry ? "is-retrying" : ""} ${ready ? "is-ready" : ""}`} dir={fa ? "rtl" : "ltr"}>
        <div className="analysis-progress-heading">
            <span className="analysis-status" role="status" aria-live="polite">
                {ready ? <Check size={16}/> : retry ? <Clock3 className="signal-retry" size={16}/> : failed ? null : <i className="signal-dot" aria-hidden="true"/>}
                <strong>{label}</strong>
            </span>
            {onCollapse && <button className="progress-collapse" onClick={onCollapse} aria-label={t.collapseProgress}><ChevronUp size={19}/></button>}
        </div>
        {queueText && <p className="analysis-queue-status">{queueText}{queue?.activeCount != null && queue.activeCount > 0 && <> · {formatCount(queue.activeCount, t)} {fa ? "مچ در حال انجام" : "active"}</>}</p>}
        <ol className="analysis-steps" key={requestKey}>
            {stages.map((stage, index) => {
                const done = active !== null && active > index;
                const current = active === index;
                const liquid = current && progressing && percent !== 0;
                const level = downloading && percent !== null ? percent : 42;
                const state = done ? "done" : current ? failed ? "failed" : retry ? "retrying" : "active" : "waiting";
                return <li key={index} className={state} aria-current={current ? "step" : undefined}>
                    {index < 4 && <i className="analysis-connector" aria-hidden="true"><i/></i>}
                    <div className="analysis-stage-orb">
                        {liquid && <Liquid level={level}/>}
                        <span className="analysis-step-symbol" aria-hidden="true">
                            {current && retry ? <Clock3 size={17}/> : current && downloading && percent !== null ? `${formatCount(percent, t)}${fa ? "٪" : "%"}`
                                : current && progressing ? index === 3 ? <Activity size={18}/> : index === 2 ? <Download size={18}/> : <Radio size={18}/>
                                : formatCount(index + 1, t)}
                        </span>
                        <span className="analysis-step-check" aria-hidden="true"><Check size={19}/></span>
                    </div>
                    <b>{stage}</b>
                    {done && <span className="sr-only">{t.analysisStepDone}</span>}
                </li>;
            })}
        </ol>
        {downloading && progress && <div className="analysis-transfer">
            <div className="analysis-transfer-heading"><span>{t.analysisServerTransfer}</span><bdi>{percent === null ? t.analysisUnknownSize : `${formatCount(percent, t)}${fa ? "٪" : "%"}`}</bdi></div>
            <progress value={percent ?? undefined} max={100} aria-label={t.analysisDownload}/>
            <div className="analysis-transfer-metrics"><bdi dir="ltr">{mb(progress.bytes)}{total != null && Number.isFinite(total) && total > 0 ? ` / ${mb(total)}` : ""}</bdi>{Number.isFinite(progress.bytesPerSecond) && progress.bytesPerSecond > 0 && <bdi dir="ltr">{mb(progress.bytesPerSecond)}/s</bdi>}</div>
        </div>}
        {phase === "uploading" && !ready && <p className="analysis-archive-note">{t.analysisArchiveIndependent}</p>}
        {retry && <details className="analysis-retry-disclosure"><summary>{fa ? "جزئیات پردازش" : "Processing details"}</summary><small className="analysis-retry-details">{t.analysisAttempts}{fa ? ": " : " "}<bdi>{formatCount(progress?.attempts || 1, t)}</bdi>{progress?.nextTryAt && <>{` · ${t.nextRetryTime}: `}<time dateTime={progress.nextTryAt}><bdi dir="ltr">{formatClock24(progress.nextTryAt, t)}</bdi></time></>}</small></details>}
        {failed && <ErrorNotice code={code} title={`${t.analysisFailed}${inferred === null ? "" : ` · ${stages[inferred]}`}`} t={t}/>}
        {retry && code && <p className="retry-explanation">{friendlyError(code, t)}</p>}
    </div>;
}
