import { lazy, Suspense, useState } from "react";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { applyAnalysisPositionOverrides } from "@/lib/dota/analysis-position-overrides";
import type { Session } from "@/lib/types";
import { apiRequest } from "../api";
import type { HistoryMatch } from "../history";
import type { Messages } from "../i18n";
import { useMatchDetails } from "../useMatchDetails";
import { CopyValue } from "./Shared";
import type { ReplayProgress } from "@/lib/replay/progress";
import { LoadingView } from "./LoadingView";
import { AnalysisProgress } from "./AnalysisProgress";
import { ErrorNotice } from "./ErrorNotice";
import { formatDateTime24 } from "../time";
import { ComingSoon } from "./Workspace";
import { QuickSummary, VictoryBanner } from "./QuickSummary";
const PerformanceAnalysis = lazy(() => import("./PerformanceAnalysis"));
export function Analysis({ t, row, onBack, live = false, session }: {
    t: Messages;
    row: HistoryMatch;
    onBack: () => void;
    live?: boolean;
    session?: Session;
}) {
    const { match, updateMatch: setMatch, preparation, setPreparation, error, setError, checking } = useMatchDetails(row, live, session);
    const [selected, setSelected] = useState<number | null>(null), [tab, setTab] = useState("summary"), [pending, setPending] = useState(false);
    const selectedSlot = selected !== null && match?.participants?.some(p => p.playerSlot === selected) ? selected
        : match?.participants?.find(p => p.isProfilePlayer)?.playerSlot ?? match?.participants?.[0]?.playerSlot ?? 0;
    async function requestAnalysis() {
        if (!match || pending) return;
        setPending(true); setError(null);
        try {
            const result = await apiRequest<{ preparation?: { replay: string; progress?: ReplayProgress | null; errorCode?: string | null } }>(`/api/matches/${encodeURIComponent(match.id)}/analysis`, { method: "POST", body: "{}" });
            setPreparation(result.preparation || { replay: "pending", progress: { phase: "queued", bytes: 0, totalBytes: null, bytesPerSecond: 0, attempts: 0, nextTryAt: null, phaseStartedAt: null, heartbeatAt: null, retryDeadlineAt: null, errorCode: null } });
            window.dispatchEvent(new Event("dota-notes:matches-updated"));
        }
        catch (failure) { setError(failure); }
        finally { setPending(false); }
    }
    const tabs = [{ key: "summary", label: t.summary }, { key: "analysis", label: t.fullAnalysis }, { key: "journal", label: t.journal }, { key: "images", label: t.images }];
    if (!match) return <div className="screen-stack"><button className="text-button" onClick={onBack}>{t.back}</button>{!!error ? <ErrorNotice error={error} t={t}/> : <LoadingView t={t}/>}</div>;
    return <div className="screen-stack match-detail"><div className="detail-toolbar"><button className="text-button" onClick={onBack}><ArrowLeft size={17}/>{t.back}</button></div><VictoryBanner match={match} row={row} t={t}/><div className="match-meta"><div className="panel match-identity"><span className="muted">{t.matchId}</span><CopyValue value={row.id} t={t}/><i /><CalendarDays size={15}/><span>{formatDateTime24(row.startedAt, t)}</span></div></div><nav className="detail-tabs" role="tablist" aria-label={t.details}>{tabs.map((item, i) => <button id={`detail-tab-${item.key}`} key={item.key} role="tab" tabIndex={tab === item.key ? 0 : -1} aria-selected={tab === item.key} aria-controls="detail-panel" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)} onKeyDown={e => { let next = i; const rtl = document.documentElement.dir === "rtl"; if (e.key === "ArrowRight")
        next += rtl ? -1 : 1;
    else if (e.key === "ArrowLeft")
        next += rtl ? 1 : -1;
    else if (e.key === "Home")
        next = 0;
    else if (e.key === "End")
        next = tabs.length - 1;
    else
        return; e.preventDefault(); const key = tabs[(next + tabs.length) % tabs.length].key; setTab(key); document.getElementById(`detail-tab-${key}`)?.focus(); }}>{item.label}</button>)}</nav><div role="tabpanel" id="detail-panel" aria-labelledby={`detail-tab-${tab}`}>
    {tab === "summary" && <QuickSummary match={match} selected={selectedSlot} onSelect={setSelected} onAnalyze={() => setTab("analysis")} t={t}/>}
    {tab === "analysis" && (match.analysis ? <Suspense fallback={<LoadingView t={t}/>}><PerformanceAnalysis analysis={match.analysis} selected={selectedSlot} onSelect={setSelected} t={t} onPositionOverrides={updates => setMatch(m => m ? ({ ...m, positionOverrides: { ...m.positionOverrides, ...updates }, analysis: m.analysis ? applyAnalysisPositionOverrides(m.analysis, updates) : undefined, participants: m.participants?.map(p => ({ ...p, position: updates[String(p.playerSlot)] ?? p.position })) }) : m)}/></Suspense> : <section className="panel analysis-preparation"><p>{live ? t.analysisPending : t.previewAnalysis}</p>{live && <><AnalysisProgress preparation={preparation} t={t}/>{(!preparation || ["basic", "failed", "expired"].includes(preparation.replay)) && <button className="primary-button" disabled={pending || checking} onClick={() => void requestAnalysis()}>{pending || checking ? t.checking : t.analyze}</button>}</>}{!!error && <ErrorNotice error={error} title={t.analysisFailed} t={t}/>}</section>)}
    {tab === "journal" && <ComingSoon title={t.journal} t={t}/>} {tab === "images" && <ComingSoon title={t.images} t={t}/>}
  </div></div>;
}
