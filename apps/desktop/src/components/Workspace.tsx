import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Search, Swords, X, Sparkles, Trophy, Activity, ArrowUpRight, Zap, Shield, Gamepad2, Brain, Sprout, TrendingUp, CircleHelp, Check, LoaderCircle, ArrowUpLeft, ChevronDown, Send, AlertCircle } from "lucide-react";
import { heroById, heroImage, heroIcon } from "@/data/heroes";
import { positionImage } from "@/data/positions";
import { buildPersianCalendarMonth } from "@/lib/persian-calendar";
import type { Session } from "@/lib/types";
import { COOLDOWNS, durationText, filterHistory, loadHistoryPage, matchDateKey, PAGE_SIZE, periodRange, roles, SAMPLE_DATE, summarize, type HistoryMatch, type Period, type Scope, type Summary } from "../history";
import { isPersian, messages, modeLabel, type Messages } from "../i18n";
import { Avatar, CopyValue, previewProfile, profileRegistrationDate } from "./Shared";
import { Hint } from "./Hint";
import { LoadingView } from "./LoadingView";
import { apiRequest } from "../api";
import { AnalysisProgress } from "./AnalysisProgress";
import { ErrorNotice } from "./ErrorNotice";
import type { ReplayProgress } from "@/lib/replay/progress";
import { Calendar, requestRange, trackingStart } from "./Calendar";
import { MatchLoadout } from "./MatchLoadout";
export { Replay } from "./Replay";
export type ShortcutPage = "matches" | "replay" | "reports" | "coach" | "farm" | "meta";
export function Position({ value, title = true, t = messages.en, analyzed = false, reportable = false }: { value: number | null | undefined; title?: boolean; t?: Messages; analyzed?: boolean; reportable?: boolean }) {
    const [reported, setReported] = useState(false);
    if (!value || value < 1 || value > 5) return <Hint label={t.unknownPosition} text={analyzed ? t.positionUnresolved : t.analyzeForPosition}
        action={analyzed && reportable ? <span className="position-report"><small>{t.reportPreview}</small><button type="button" className="position-report-button" disabled={reported} onClick={event => { event.stopPropagation(); setReported(true); }}>{reported ? <Check size={16}/> : <Send size={16}/>}<span>{reported ? t.reportPreviewDone : t.reportPosition}</span></button></span> : undefined}>
        <span className={`position-badge position-unknown ${analyzed ? "is-unresolved" : ""}`}><CircleHelp size={24}/>{title && <span>—</span>}</span></Hint>;
    return <span className="position-badge" title={`Pos ${value} · ${roles[value]}`}><img src={positionImage(value)} alt={roles[value]} width={22} height={22}/>{title && <span>{roles[value]}</span>}</span>;
}
export function PeriodControls({ period, setPeriod, anchor, setAnchor, t, compact = false, registration = previewProfile.registeredDate!, maxDate = SAMPLE_DATE }: {
    period: Period;
    setPeriod: (p: Period) => void;
    anchor: string;
    setAnchor: (d: string) => void;
    t: Messages;
    compact?: boolean;
    registration?: string;
    maxDate?: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const min = trackingStart(registration), range = periodRange(period, anchor);
    function destination(direction: number) { const d = new Date(`${anchor}T00:00:00Z`); if (period === "week")
        d.setUTCDate(d.getUTCDate() + 7 * direction);
    else return direction < 0 ? buildPersianCalendarMonth(anchor).previousCursor : buildPersianCalendarMonth(anchor).nextCursor;
    return d.toISOString().slice(0, 10); }
    function move(direction: number) { const date = destination(direction); setAnchor(date < min ? min : date > maxDate ? maxDate : date); }
    useEffect(() => { if (!open)
        return; const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node))
        setOpen(false); }; const escape = (e: KeyboardEvent) => { if (e.key === "Escape")
        setOpen(false); }; window.addEventListener("mousedown", close); window.addEventListener("keydown", escape); return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); }; }, [open]);
    return <div className={`period-toolbar ${compact ? "compact" : ""}`} ref={ref}>
    <div className="segmented" role="group" aria-label={t.period}>{(["week", "month"] as const).map(p => <button key={p} aria-pressed={period === p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{p === "week" ? t.weekly : t.monthly}</button>)}</div>
    {!compact && <div className="period-range"><button aria-label={t.previous} disabled={range.from <= min} onClick={() => move(-1)}><ChevronLeft size={15}/></button><button className="date-trigger" aria-label={t.selectedDate} aria-expanded={open} onClick={() => setOpen(v => !v)}><CalendarDays size={15}/>{!compact && <bdi>{range.from} — {range.to > maxDate ? maxDate : range.to}</bdi>}</button><button aria-label={t.next} disabled={range.to >= maxDate} onClick={() => move(1)}><ChevronRight size={15}/></button></div>}
    {!compact && open && <div className="calendar-popover"><Calendar value={anchor} scope={period} min={min} max={maxDate} t={t} onChange={d => { setAnchor(d); setOpen(false); }}/></div>}
  </div>;
}
export function ringArc(from: number, to: number, inner: number, outer: number) {
    const point = (a: number, r: number) => `${160 + Math.sin(a) * r},${160 - Math.cos(a) * r}`;
    // Two half arcs also support a single 100% slice; one SVG arc cannot draw a full circle.
    const gap = Math.min(.006, (to - from) / 10), a = from + gap, b = to - gap, middle = (a + b) / 2;
    return `M ${point(a, outer)} A ${outer} ${outer} 0 0 1 ${point(middle, outer)} A ${outer} ${outer} 0 0 1 ${point(b, outer)} L ${point(b, inner)} A ${inner} ${inner} 0 0 0 ${point(middle, inner)} A ${inner} ${inner} 0 0 0 ${point(a, inner)} Z`;
}
export function Distribution({ t, registration = previewProfile.registeredDate!, query = "", mode = "all", position = "all" }: {
    t: Messages;
    registration?: string;
    query?: string;
    mode?: string;
    position?: string;
}) {
    const [period, setPeriod] = useState<Period>("week"), [anchor, setAnchor] = useState(SAMPLE_DATE);
    const summary = useMemo(() => summarize(filterHistory(period, anchor, query, mode, position)), [period, anchor, query, mode, position]);
    const [hover, setHover] = useState<{
        key: string;
        label: string;
        count: number;
        wins: number;
        losses: number;
        image: string;
    } | null>(null);
    useEffect(() => setHover(null), [summary]);
    const segments = (data: Summary["heroes"], inner: number, outer: number, hero: boolean) => {
        let offset = 0;
        return data.map(s => {
            const from = offset;
            offset += s.count / summary.total * Math.PI * 2;
            const middle = (from + offset) / 2, radius = (inner + outer) / 2;
            const h = heroById(s.id), label = hero ? h?.name || "" : roles[s.id], img = hero && h ? heroIcon(h) : positionImage(s.id), key = `${hero ? "hero" : "pos"}-${s.id}`;
            const enter = () => setHover({ ...s, key, label, image: img });
            return <g key={key} role="button" tabIndex={0} aria-label={`${label}: ${s.count} ${t.matches}, ${(s.count / summary.total * 100).toFixed(1)}%, ${s.wins} W, ${s.losses} L`} onMouseEnter={enter} onMouseLeave={() => setHover(null)} onFocus={enter} onBlur={() => setHover(null)} onClick={enter}>
      <path className={`ring-segment ${hero ? "hero-segment" : "position-segment"} ${hover?.key === key ? "is-hovered" : ""}`} d={ringArc(from, offset, inner, outer)}/>{offset - from > .13 && <image href={img} x={160 + Math.sin(middle) * radius - 12} y={160 - Math.cos(middle) * radius - 12} width={24} height={24} pointerEvents="none"/>}
    </g>;
        });
    };
    return <section className="panel distribution"><div className="section-heading"><div><p className="eyebrow">PLAYSTYLE</p><h2>{t.trend}</h2></div></div><PeriodControls {...{ period, setPeriod, anchor, setAnchor, t, registration }} compact/>{summary.total > 0 ? <><div className="ring-wrapper"><svg viewBox="0 0 320 320" aria-label={t.trend}>{summary.total > 0 && <>{segments(summary.positions, 59, 100, false)}{segments(summary.heroes, 104, 150, true)}</>}</svg><div className="ring-center" key={hover?.key || "total"} aria-live="polite">{hover ? <><img src={hover.image} alt=""/><strong>{(hover.count / summary.total * 100).toFixed(1)}%</strong><small>{hover.count} {t.matches}</small></> : <><strong>{summary.total}</strong><small>{t.matches}</small></>}</div></div><div className="ring-tooltip" aria-live="polite"><strong>{hover?.label || (period === "week" ? t.weekly : t.monthly)}</strong><span><b className="good">{hover?.wins ?? summary.wins} W</b><b className="bad">{hover?.losses ?? summary.losses} L</b><small>{((hover ? hover.wins / hover.count : summary.winRate / 100) * 100 || 0).toFixed(1)}% {t.winRate}</small></span></div><div className="role-legend">{summary.positions.map(s => <span key={s.id}><Position value={s.id} title={false}/><bdi>{(s.count / summary.total * 100).toFixed(0)}%</bdi></span>)}</div></> : <p className="empty-message">{t.noData}</p>}<small className="muted chart-period"><bdi>{periodRange(period, anchor).from} — {periodRange(period, anchor).to > SAMPLE_DATE ? SAMPLE_DATE : periodRange(period, anchor).to}</bdi></small></section>;
}
export function Stats({ summary, t }: {
    summary: Summary;
    t: Messages;
}) {
    return <div className="stat-grid">{[[t.totalMatches, summary.total, Swords], [t.winRate, `${summary.winRate.toFixed(1)}%`, Trophy], [`${t.wins} / ${t.losses}`, `${summary.wins} / ${summary.losses}`, Activity], [t.averageScore, summary.score?.toFixed(1) ?? "—", Sparkles]].map(([label, value, Icon], i) => { const Symbol = Icon as typeof Swords; return <section className="panel stat-card" key={String(label)}><Symbol size={20}/><div><span>{String(label)}</span><strong className={i === 1 ? "good" : ""}><bdi>{String(value)}</bdi></strong></div>{i === 1 && <div className="progress-track"><i style={{ width: `${summary.winRate}%` }}/></div>}</section>; })}</div>;
}
export function ModeIcon({ mode, t = messages.en }: { mode: string; t?: Messages }) {
    const Icon = mode === "Turbo" ? Zap : mode === "Ranked" ? Shield : mode === "Captains Mode" ? Swords : Gamepad2;
    return <span className={`mode-chip mode-${mode.toLowerCase().replace(/[^a-z]+/g, "-")}`} title={modeLabel(mode,t)} dir={isPersian(t) ? "rtl" : "ltr"}><Icon size={14}/><b>{modeLabel(mode,t)}</b></span>;
}
export function Score({ value, t }: { value: number | null | undefined; t?: Messages }) {
    if (value == null) return <Hint label="IMP" text={t?.analyzeForScore || "Analyze this match to see your performance score."}><CircleHelp size={19}/></Hint>;
    return <span className="imp-score" title="Performance score / 100"><bdi className={`imp-value imp-${value < 30 ? "low" : value < 50 ? "orange" : value < 70 ? "blue" : value < 90 ? "green" : "high"}`}>{Math.round(value)}</bdi><span className="imp-track"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }}/></span></span>;
}
type Preparation = { replay: string; progress?: ReplayProgress | null; errorCode?: string | null };
export function MatchRow({ match, t, onOpen, live = false }: { match: HistoryMatch; t: Messages; onOpen: (m: HistoryMatch) => void; live?: boolean }) {
    const hero = heroById(match.heroId), [preparation, setPreparation] = useState<Preparation | null>(match.analysisPreparation || null), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [ready, setReady] = useState(false), [expanded, setExpanded] = useState(false);
    useEffect(() => {
        if (match.analysisPreparation) { setPreparation(match.analysisPreparation); setReady(false); }
        else if (match.analyzed) { setPreparation(null); setReady(true); }
        else {
            setReady(false);
        }
    }, [match.analyzed, match.analysisPreparation]);
    const running = busy || ["pending", "queued", "processing"].includes(preparation?.replay || (!ready && !match.analyzed ? match.analysisStatus || "" : ""));
    useEffect(() => {
        if (!live || !running || busy || match.analysisPreparation) return;
        const controller = new AbortController(); let timer = 0;
        const poll = async () => {
            try {
                const result = await apiRequest<{ analysis: unknown; preparation?: Preparation }>(`/api/matches/${encodeURIComponent(match.journalId || match.id)}/analysis`, { signal: controller.signal });
                if (controller.signal.aborted) return;
                if (result.analysis) { setReady(true); setPreparation(null); window.dispatchEvent(new Event("dota-notes:matches-updated")); return; }
                setPreparation(result.preparation || null); setError(null);
            } catch (failure) { if (!controller.signal.aborted) setError(failure); }
            if (!controller.signal.aborted) timer = window.setTimeout(poll, 3_000);
        };
        void poll(); return () => { controller.abort(); window.clearTimeout(timer); };
    }, [live, running, busy, match.id, match.journalId, Boolean(match.analysisPreparation)]);
    async function analyze() {
        if (running) return;
        if (match.analyzed || ready || !live) { onOpen(match); return; }
        setBusy(true); setError(null); setExpanded(true);
        try {
            const result = await apiRequest<{ analysis?: unknown; preparation?: Preparation }>(`/api/matches/${encodeURIComponent(match.journalId || match.id)}/analysis`, { method: "POST", body: "{}" });
            if (result.analysis || result.preparation?.replay === "ready") { setReady(true); setPreparation(null); window.dispatchEvent(new Event("dota-notes:matches-updated")); }
            else {
                setPreparation(result.preparation || { replay: "pending" });
                window.dispatchEvent(new Event("dota-notes:matches-updated"));
            }
        } catch (failure) { setError(failure); } finally { setBusy(false); }
    }
    const analyzed = !running && (match.analyzed || ready);
    const failed = !running && !analyzed && (preparation?.replay === "failed" || match.analysisStatus === "failed" || Boolean(error));
    return <><div role="row" className="match-row" data-match-row={match.id}>

        <span role="cell"><button className="row-hero" onClick={() => onOpen(match)} aria-label={`${hero?.name || t.heroColumn} · ${t.details} ${match.id}`}><img src={hero ? heroImage(hero) : ""} alt={hero?.name} width={64} height={36} loading="lazy"/></button></span>
        <span role="cell"><Position value={match.position} title={false} t={t} analyzed={match.analyzed || ready} reportable/></span><span role="cell" className={`result-pill ${match.won ? "win" : "loss"}`}>{match.won ? "W" : "L"}</span>
        <bdi role="cell" className="row-kda">{match.k} / {match.d} / {match.a}</bdi><span role="cell"><Score value={match.score} t={t}/></span><span role="cell"><ModeIcon mode={match.mode} t={t}/></span>
        <span role="cell"><button className={`analysis-action ${analyzed ? "ready" : running ? "running" : failed ? "failed" : "pending"}`} aria-expanded={running || failed ? expanded : undefined} onClick={() => running || failed ? setExpanded(value => !value) : void analyze()}>{analyzed ? <Check size={15}/> : running ? <LoaderCircle className="processing-spinner" size={15}/> : failed ? <AlertCircle size={15}/> : <Sparkles size={14}/>}<span>{analyzed ? t.analysisDone : running ? t.analysisQueued : failed ? t.analysisError : t.analyze}</span>{(running || failed) && <ChevronDown size={15} className={expanded ? "is-expanded" : ""}/>}</button></span>
        <bdi role="cell" className="row-duration">{durationText(match.duration)}</bdi><span role="cell" className="match-id-cell"><CopyValue value={match.id} t={t}/></span>
        <span role="cell" className="items-cell"><MatchLoadout match={match} t={t}/></span>
        <span role="cell" className="details-cell"><button className="match-details-button" onClick={() => onOpen(match)} aria-label={`${t.details} ${match.id}`}>{isPersian(t) ? <ArrowUpRight size={17}/> : <ArrowUpLeft size={17}/>}</button></span>
    </div>{expanded && (preparation || failed) && <div className="row-analysis-progress">{error ? <ErrorNotice error={error} title={t.analysisFailed} t={t}/> : <AnalysisProgress preparation={preparation || {replay:"failed"}} t={t} compact onCollapse={() => setExpanded(false)}/>} {failed && <button className="analysis-retry-button" onClick={()=>void analyze()}>{t.analysisRetryAction}</button>}</div>}</>;
}
export function MatchTable({ matches, t, onOpen, groupDays = false, live = false }: { matches: HistoryMatch[]; t: Messages; onOpen: (m: HistoryMatch) => void; groupDays?: boolean; live?: boolean }) {
    const header = useRef<HTMLDivElement>(null);
    // One shared width for every row/header; loadout growth never stretches the gaps.
    const buffs = Math.max(0,...matches.map(m=>m.buffs?.length || 0));
    const loadoutWidth = 332 + (buffs ? 12 + buffs*36 + (buffs-1)*6 : 0);
    const style = {"--loadout-width":`${loadoutWidth}px`} as CSSProperties;
    const columns = [t.heroColumn,t.posColumn,t.result,"K / D / A","IMP",t.mode,t.analysis,t.duration,t.matchId,t.items,t.details];
    return <div role="table" aria-label={t.matches} className="match-table-region" style={style}><div className="match-table-sticky" ref={header}><div role="row" className="match-row table-head">{columns.map(label=><span role="columnheader" className={label===t.items ? "items-cell" : label===t.details ? "details-cell" : undefined} key={label}>{label}</span>)}</div></div><div className="table-scroll" onScroll={event=>{if(header.current)header.current.scrollLeft=event.currentTarget.scrollLeft;}}><div className="match-table">{matches.map((m,i)=><div role="rowgroup" key={m.id}>{groupDays && (i===0 || matchDateKey(m)!==matchDateKey(matches[i-1])) && <div className="day-divider"><span>{new Intl.DateTimeFormat(isPersian(t)?"fa-IR":"en-US",{weekday:"long",month:"short",day:"numeric",timeZone:"Asia/Tehran"}).format(new Date(m.startedAt))}</span><i/></div>}<MatchRow match={m} t={t} onOpen={onOpen} live={live}/></div>)}</div></div></div>;
}

export function Matches({ t, onOpen, session = previewProfile }: {
    t: Messages;
    onOpen: (m: HistoryMatch) => void;
    session?: Session;
}) {
    const [period, setPeriod] = useState<Period>("week"), [anchor, setAnchor] = useState(SAMPLE_DATE), [query, setQuery] = useState(""), [mode, setMode] = useState("all"), [position, setPosition] = useState("all"), [page, setPage] = useState(1), [fetchOpen, setFetchOpen] = useState(false);
    const [data, setData] = useState({ rows: [] as HistoryMatch[], total: 0, summary: summarize([]) }), [loading, setLoading] = useState(true);
    const key = `${period}:${anchor}:${query}:${mode}:${position}`, [lastKey, setLastKey] = useState(key);
    if (lastKey !== key) {
        setLastKey(key);
        setPage(1);
    }
    useEffect(() => { const controller = new AbortController(); setLoading(true); void loadHistoryPage({ period, anchor, query, mode, position, page }, controller.signal).then(result => { if (!controller.signal.aborted) {
        setData(result);
        setLoading(false);
    } }).catch(() => { }); return () => controller.abort(); }, [period, anchor, query, mode, position, page]);
    const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
    return <div className="screen-stack"><div className="page-heading"><h1>{t.matches}</h1><button className="primary-button" onClick={() => setFetchOpen(true)}><Download size={16}/>{t.fetchMatches}</button></div><div className="history-toolbar"><PeriodControls {...{ period, setPeriod, anchor, setAnchor, t }} registration={profileRegistrationDate(session)}/><div className="filters"><label className="search-box"><Search size={16}/><input aria-label={t.search} placeholder={`${t.matchId} / Hero`} value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label={t.mode} value={mode} onChange={e => setMode(e.target.value)}><option value="all">{t.allModes}</option>{["Ranked", "Turbo", "All Pick"].map(m => <option key={m}>{m}</option>)}</select><select aria-label={t.position} value={position} onChange={e => setPosition(e.target.value)}><option value="all">{t.allPositions}</option>{roles.slice(1).map((r, i) => <option key={r} value={i + 1}>{r}</option>)}</select></div></div><Stats summary={data.summary} t={t}/><div className="history-grid"><section className="panel match-list" aria-busy={loading}><div className="section-heading"><h2>{t.matches}</h2><small className="muted">{data.total} {t.totalMatches}</small></div>{loading && <LoadingView t={t}/>} {!loading && <MatchTable matches={data.rows} t={t} onOpen={onOpen} groupDays/>}{!loading && !data.total && <p className="empty-message">{t.noData}</p>}<div className="pagination"><button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>{t.previous}</button><span>{t.page} {page} {t.of} {pages}</span><button disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)}>{t.next}</button></div></section><Distribution query={query} mode={mode} position={position} t={t} registration={profileRegistrationDate(session)}/></div>{fetchOpen && <FetchDialog t={t} session={session} onClose={() => setFetchOpen(false)}/>}</div>;
}
export function Dashboard({ t, onOpen, onNavigate, session = previewProfile }: {
    t: Messages;
    onOpen: (m: HistoryMatch) => void;
    onNavigate: (page: ShortcutPage) => void;
    session?: Session;
}) {
    const [period, setPeriod] = useState<Period>("week"), [anchor, setAnchor] = useState(SAMPLE_DATE), [fetchOpen, setFetchOpen] = useState(false);
    const matches = useMemo(() => filterHistory(period, anchor), [period, anchor]), summary = useMemo(() => summarize(matches), [matches]);
    return <div className="screen-stack"><section className="panel profile-banner"><Avatar session={session}/><div><p className="eyebrow">PLAYER PROFILE</p><h1><bdi>{session.displayName || session.username}</bdi></h1></div><div className="profile-period"><PeriodControls {...{ period, setPeriod, anchor, setAnchor, t }} registration={profileRegistrationDate(session)}/></div><button className="primary-button" onClick={() => setFetchOpen(true)}><Download size={16}/>{t.fetchMatches}</button></section><Stats summary={summary} t={t}/><div className="shortcut-grid">{([{ page: "reports", label: t.reports, icon: Brain }, { page: "replay", label: t.downloadReply, icon: Download }, { page: "matches", label: t.matches, icon: Swords }, { page: "coach", label: t.coach, icon: Sparkles }, { page: "farm", label: t.farm, icon: Sprout }, { page: "meta", label: t.meta, icon: TrendingUp }] as const).map(({ page, label, icon: Icon }) => <button className="panel shortcut" key={page} onClick={() => onNavigate(page)}><Icon size={19}/><span>{label}</span><ArrowUpRight size={14}/></button>)}</div><div className="history-grid"><section className="panel match-list"><div className="section-heading"><h2>{t.recent}</h2><button className="text-button" onClick={() => onNavigate("matches")}>{t.matches}<ArrowUpRight size={15}/></button></div><MatchTable matches={matches.slice(0, 10)} t={t} onOpen={onOpen} groupDays/>{!matches.length && <p className="empty-message">{t.noData}</p>}</section><Distribution t={t} registration={profileRegistrationDate(session)}/></div>{fetchOpen && <FetchDialog session={session} t={t} onClose={() => setFetchOpen(false)}/>}</div>;
}
export function Modal({ title, onClose, children, className = "", closeLabel = "Close" }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
    closeLabel?: string;
}) {
    const ref = useRef<HTMLElement>(null), closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; const close = (e: KeyboardEvent) => { if (e.key === "Escape")
        closeRef.current(); if (e.key === "Tab") {
        const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,textarea,a[href],[tabindex="0"]') || []), first = elements[0], last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
        }
    } }; ref.current?.querySelector<HTMLElement>('button')?.focus(); window.addEventListener("keydown", close); return () => { window.removeEventListener("keydown", close); previous?.focus(); }; }, []);
    return <div className={`modal-backdrop ${className}`} onMouseDown={e => e.target === e.currentTarget && onClose()}><section ref={ref} className="panel modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button aria-label={closeLabel} onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}
const cooldownKey = "dota-notes.preview-sync-cooldowns.v1";
function readCooldowns(): Record<Scope, number> { try {
    const v = JSON.parse(localStorage.getItem(cooldownKey) || "{}");
    return { day: Number(v.day) || 0, week: Number(v.week) || 0, month: Number(v.month) || 0 };
}
catch {
    return { day: 0, week: 0, month: 0 };
} }
export function FetchDialog({ t, onClose, session = previewProfile }: {
    t: Messages;
    onClose: () => void;
    session?: Session;
}) {
    const [scope, setScope] = useState<Scope>("day"), [date, setDate] = useState(SAMPLE_DATE), [modes, setModes] = useState(["Ranked", "Turbo", "All Pick", "Captains", "Other"]), [deadlines, setDeadlines] = useState(readCooldowns), [now, setNow] = useState(Date.now()), [notice, setNotice] = useState("");
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const registration = profileRegistrationDate(session), min = trackingStart(registration), range = requestRange(scope, date, registration, SAMPLE_DATE), remaining = Math.max(0, Math.ceil((deadlines[scope] - now) / 1000));
    function submit() { if (remaining || !modes.length || !range)
        return; const next = { ...deadlines, [scope]: Date.now() + COOLDOWNS[scope] }; setDeadlines(next); try {
        localStorage.setItem(cooldownKey, JSON.stringify(next));
    }
    catch { } setNotice(t.previewQueued); }
    return <Modal title={t.fetchMatches} onClose={onClose}><p className="muted">{t.demoNotice}</p><div className="segmented scope-switch">{(["day", "week", "month"] as const).map(s => <button key={s} aria-pressed={scope === s} className={scope === s ? "active" : ""} onClick={() => { setScope(s); setNotice(""); }}>{t[s]}</button>)}</div><Calendar value={date} onChange={setDate} scope={scope} min={min} max={SAMPLE_DATE} t={t}/><p className="request-range"><bdi>{range ? `${range.from} — ${range.to}` : "—"}</bdi></p><small className="muted">{t.trackingSince}: <bdi>{min}</bdi></small><div className="mode-options">{["Ranked", "Turbo", "All Pick", "Captains", "Other"].map(mode => <label className={modes.includes(mode) ? "selected" : ""} key={mode}><input type="checkbox" checked={modes.includes(mode)} onChange={() => setModes(m => m.includes(mode) ? m.filter(x => x !== mode) : [...m, mode])}/><ModeIcon mode={mode} t={t}/></label>)}</div><div className="cooldown-grid">{(["day", "week", "month"] as const).map(s => <div key={s}><span>{t[s]}</span><bdi>{durationText(COOLDOWNS[s] / 1000)}</bdi><small>{Math.max(0, Math.ceil((deadlines[s] - now) / 1000))}s {t.remaining}</small></div>)}</div><button className="primary-button" disabled={remaining > 0 || !modes.length || !range} onClick={submit}>{remaining ? `${t.readyIn} ${durationText(remaining)}` : t.previewRequest}</button><p role="status" className="muted">{notice}</p></Modal>;
}
export function ComingSoon({ title, t }: {
    title: string;
    t: Messages;
}) { return <section className="panel coming-soon"><Sparkles size={30}/><h1>{title}</h1><span>{t.comingSoon}</span></section>; }
