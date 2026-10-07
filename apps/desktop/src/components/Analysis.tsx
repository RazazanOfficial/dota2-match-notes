import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock, Coins } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { applyAnalysisPositionOverrides } from "@/lib/dota/analysis-position-overrides";
import MatchInventory from "@/components/MatchInventory";
import type { Match, MatchAnalysis, MatchParticipant, MatchPlayerAnalysis, Session } from "@/lib/types";
import { apiRequest } from "../api";
import { detailFor, durationText, type HistoryMatch } from "../history";
import { isPersian, type Messages } from "../i18n";
import { CopyValue } from "./Shared";
import type { ReplayProgress } from "@/lib/replay/progress";
import { LoadingView } from "./LoadingView";
import { AnalysisProgress } from "./AnalysisProgress";
import { ErrorNotice } from "./ErrorNotice";
import { formatDateTime24 } from "../time";
import { ComingSoon, ModeIcon, Position, Score } from "./Workspace";
const PerformanceAnalysis = lazy(() => import("./PerformanceAnalysis"));
export function Analysis({ t, row, onBack, live = false, session }: {
    t: Messages;
    row: HistoryMatch;
    onBack: () => void;
    live?: boolean;
    session?: Session;
}) {
    const initial = useMemo(() => live ? null : detailFor(row), [row, live]);
    const [match, setMatch] = useState<Match | null>(initial), [selected, setSelected] = useState(0), [tab, setTab] = useState("summary"), [error, setError] = useState<unknown>(null), [pending, setPending] = useState(false);
    const [preparation, setPreparation] = useState<{ replay: string; progress?: ReplayProgress | null; errorCode?: string | null } | null>(null);
    const [refreshToken, setRefreshToken] = useState(0), [checking, setChecking] = useState(false);
    useEffect(() => {
        if (!live || !session) return;
        const controller = new AbortController();
        const journalId = row.journalId || row.id;
        void apiRequest<{ page: { match: Match } }>(`/api/journal/matches/${encodeURIComponent(journalId)}/page?player=${encodeURIComponent(session.username)}`, { signal: controller.signal })
            .then(response => {
                const item = response.page.match;
                if (!controller.signal.aborted) { setMatch(item); setSelected(item.participants?.find(p => p.isProfilePlayer)?.playerSlot || 0); }
            }).catch(failure => { if (!controller.signal.aborted) setError(failure); });
        return () => controller.abort();
    }, [live, row.id, row.journalId, session?.username]);
    useEffect(() => {
        if (!live || tab !== "analysis" || !match || match.analysis) return;
        const controller = new AbortController();
        let timer = 0;
        setChecking(true);
        void apiRequest<{ analysis: MatchAnalysis | null; preparation?: { replay: string; progress?: ReplayProgress | null; errorCode?: string | null } }>(`/api/matches/${encodeURIComponent(match.id)}/analysis`, { signal: controller.signal })
            .then(result => {
                if (controller.signal.aborted) return;
                if (result.analysis) { setMatch(current => current ? { ...current, analysis: result.analysis! } : current); setPreparation(null); window.dispatchEvent(new Event("dota-notes:matches-updated")); }
                else {
                    setPreparation(result.preparation || null);
                    if (["pending", "queued", "processing"].includes(result.preparation?.replay || "")) timer = window.setTimeout(() => setRefreshToken(value => value + 1), 3_000);
                }
                setError(null);
            }).catch(failure => { if (!controller.signal.aborted) { setError(failure); timer = window.setTimeout(() => setRefreshToken(value => value + 1), 10_000); } })
            .finally(() => { if (!controller.signal.aborted) setChecking(false); });
        return () => { controller.abort(); window.clearTimeout(timer); };
    }, [live, tab, match?.id, match?.analysis, refreshToken]);
    async function requestAnalysis() {
        if (!match || pending) return;
        setPending(true); setError(null);
        try {
            const result = await apiRequest<{ preparation?: { replay: string; progress?: ReplayProgress | null; errorCode?: string | null } }>(`/api/matches/${encodeURIComponent(match.id)}/analysis`, { method: "POST", body: "{}" });
            setPreparation(result.preparation || { replay: "pending", progress: { phase: "queued", bytes: 0, totalBytes: null, bytesPerSecond: 0, attempts: 0, nextTryAt: null, phaseStartedAt: null, heartbeatAt: null, retryDeadlineAt: null, errorCode: null } });
            setRefreshToken(value => value + 1);
        }
        catch (failure) { setError(failure); }
        finally { setPending(false); }
    }
    const inspected = match?.participants?.find(p => p.playerSlot === selected), player = match?.analysis?.players.find(p => p.playerSlot === selected);
    const tabs = [{ key: "summary", label: t.summary }, { key: "analysis", label: t.fullAnalysis }, { key: "journal", label: t.journal }, { key: "images", label: t.images }];
    if (!match) return <div className="screen-stack"><button className="text-button" onClick={onBack}>{t.back}</button>{!!error ? <ErrorNotice error={error} t={t}/> : <LoadingView t={t}/>}</div>;
    return <div className="screen-stack match-detail"><div className="detail-toolbar"><button className="text-button" onClick={onBack}><ArrowLeft size={17}/>{t.back}</button></div><section className="panel match-banner" dir="ltr"><div className={`team-result ${match.radiantWin ? "good" : ""}`}><img src="/match-details/radiant.webp" alt=""/><div><h1>Radiant</h1><small>{match.radiantWin ? t.teamWon : t.teamLost}</small></div></div><div className="final-score"><strong>{match.radiantScore ?? "—"}</strong><span><Clock size={14}/><bdi>{durationText(row.duration)}</bdi><small><ModeIcon mode={row.mode}/></small></span><strong>{match.direScore ?? "—"}</strong></div><div className={`team-result dire ${match.radiantWin === false ? "good" : ""}`}><div><h1>Dire</h1><small>{match.radiantWin === false ? t.teamWon : t.teamLost}</small></div><img src="/match-details/dire.webp" alt=""/></div></section><div className="match-meta"><div className="panel match-identity"><span className="muted">{t.matchId}</span><CopyValue value={row.id} t={t}/><i /><CalendarDays size={15}/><span>{formatDateTime24(row.startedAt, t)}</span></div></div><nav className="detail-tabs" role="tablist" aria-label={t.details}>{tabs.map((item, i) => <button id={`detail-tab-${item.key}`} key={item.key} role="tab" tabIndex={tab === item.key ? 0 : -1} aria-selected={tab === item.key} aria-controls="detail-panel" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)} onKeyDown={e => { let next = i; const rtl = document.documentElement.dir === "rtl"; if (e.key === "ArrowRight")
        next += rtl ? -1 : 1;
    else if (e.key === "ArrowLeft")
        next += rtl ? 1 : -1;
    else if (e.key === "Home")
        next = 0;
    else if (e.key === "End")
        next = tabs.length - 1;
    else
        return; e.preventDefault(); const key = tabs[(next + tabs.length) % tabs.length].key; setTab(key); document.getElementById(`detail-tab-${key}`)?.focus(); }}>{item.label}</button>)}</nav><div role="tabpanel" id="detail-panel" aria-labelledby={`detail-tab-${tab}`}>
    {tab === "summary" && <section className="panel matchup-panel"><div className="section-heading"><h2>{t.matchup}</h2><small className="muted">{t.detailsHint}</small></div><div className="team-rosters" dir="ltr">{(["radiant", "dire"] as const).map(team => <section className={`team-roster ${team}`} key={team}><header><b>{team === "radiant" ? "Radiant" : "Dire"}</b><small>{(team === "radiant") === row.won ? t.teamWon : t.teamLost}</small></header><div className="hero-roster">{match.participants?.filter(p => p.team === team).map(p => { const hero = heroById(p.heroId), pa = match.analysis?.players.find(x => x.playerSlot === p.playerSlot); return <button className={`hero-card ${p.playerSlot === selected ? "selected" : ""}`} key={p.playerSlot} aria-pressed={p.playerSlot === selected} aria-label={`${t.selected}: ${p.heroName}`} onClick={() => setSelected(p.playerSlot)}><img src={hero ? heroImage(hero) : ""} alt={p.heroName}/><div><Position value={p.position} title={false} t={t} analyzed={!!match.analysis}/><bdi>{p.kills} / {p.deaths} / {p.assists}</bdi></div><Score value={pa?.performanceScore} t={t}/></button>; })}</div></section>)}</div>{inspected && <SelectedHero participant={inspected} player={player} t={t} onAnalyze={() => setTab("analysis")}/>}</section>}
    {tab === "analysis" && (match.analysis ? <Suspense fallback={<LoadingView t={t}/>}><PerformanceAnalysis analysis={match.analysis} selected={selected} onSelect={setSelected} t={t} onPositionOverrides={updates => setMatch(m => m ? ({ ...m, positionOverrides: { ...m.positionOverrides, ...updates }, analysis: m.analysis ? applyAnalysisPositionOverrides(m.analysis, updates) : undefined, participants: m.participants?.map(p => ({ ...p, position: updates[String(p.playerSlot)] ?? p.position })) }) : m)}/></Suspense> : <section className="panel analysis-preparation"><p>{live ? t.analysisPending : t.previewAnalysis}</p>{live && <><AnalysisProgress preparation={preparation} t={t}/>{(!preparation || ["basic", "failed", "expired"].includes(preparation.replay)) && <button className="primary-button" disabled={pending || checking} onClick={() => void requestAnalysis()}>{pending || checking ? t.checking : t.analyze}</button>}</>}{!!error && <ErrorNotice error={error} title={t.analysisFailed} t={t}/>}</section>)}
    {tab === "journal" && <ComingSoon title={t.journal} t={t}/>} {tab === "images" && <ComingSoon title={t.images} t={t}/>}
  </div></div>;
}
function SelectedHero({ participant: p, player, t, onAnalyze }: {
    participant: MatchParticipant;
    player?: MatchPlayerAnalysis;
    t: Messages;
    onAnalyze: () => void;
}) {
    const hero = heroById(p.heroId);
    return <section className={`selected-hero ${p.team}`}><div className="selected-hero-info"><img className="selected-hero-portrait" src={hero ? heroImage(hero) : ""} alt=""/><div><h2>{p.heroName}</h2><p><bdi>{p.personName}</bdi><Position value={p.position} t={t} analyzed={!!player}/></p></div><div className="selected-hero-kda"><small>K / D / A</small><strong>{p.kills} / {p.deaths} / {p.assists}</strong></div><div className="selected-hero-imp"><small>IMP</small><Score value={player?.performanceScore} t={t}/></div><button className="secondary-button" onClick={onAnalyze}>{t.fullAnalysis}<ArrowUpRight size={16}/></button></div><div className="selected-hero-body"><div className="hero-telemetry">{[[t.netWorth, p.netWorth], ["GPM", p.goldPerMinute], ["XPM", p.xpPerMinute], ["LH / DN", `${p.lastHits} / ${p.denies}`], ["Hero DMG", p.heroDamage], ["Tower DMG", p.towerDamage], ["Heal", p.heroHealing], ["Level", p.level]].map(([label, value]) => <div key={String(label)}><small>{label}</small><bdi>{typeof value === "number" ? value.toLocaleString("en-US") : value ?? "—"}</bdi></div>)}</div><div className="selected-inventory"><MatchInventory participant={p}/><small><Coins size={13}/>{t.netWorth} <bdi>{p.netWorth?.toLocaleString("en-US")}</bdi></small></div></div></section>;
}
