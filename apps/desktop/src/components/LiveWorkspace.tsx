import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Download, Search } from "lucide-react";
import { heroById, heroIcon } from "@/data/heroes";
import { positionImage } from "@/data/positions";
import type { Session } from "@/lib/types";
import { getSyncStatus, listMatches, requestMatchSync, type MatchListResponse, type SyncJob } from "../api";
import { durationText, PAGE_SIZE, roles, type HistoryMatch, type HistoryQuery, type Period, type Scope, type Summary } from "../history";
import type { Messages } from "../i18n";
import { Calendar, requestRange, trackingStart } from "./Calendar";
import { Avatar, profileRegistrationDate } from "./Shared";
import { MatchTable, Modal, PeriodControls, Position, ringArc, Stats, type ShortcutPage } from "./Workspace";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const empty: Summary = { total: 0, wins: 0, losses: 0, winRate: 0, score: null, heroes: [], positions: [] };
const refreshEvent = "dota-notes:matches-updated";
const refreshMatches = () => window.dispatchEvent(new Event(refreshEvent));
const heroPalette = ["#ec8e78", "#d4b170", "#75c9b1", "#86a9e9", "#bc98de", "#dd9dc5", "#84c8dc", "#b6c67b"];
const positionPalette = ["#dfa279", "#81bada", "#85c39d", "#b39ade", "#e1b782"];

function useSyncFeed() {
    const [job, setJob] = useState<SyncJob | null>(null);
    useEffect(() => {
        let active = true, timer = 0, lastFingerprint = "";
        const poll = async () => {
            let inProgress = false;
            try {
                const { status } = await getSyncStatus();
                if (!active) return;
                const next = status.manualJob || null;
                setJob(next);
                inProgress = next?.status === "pending" || next?.status === "processing";
                const fingerprint = next ? `${next.id}:${next.status}:${next.attempted?.length ?? 0}:${next.result?.imported?.length ?? 0}` : "";
                if (fingerprint && fingerprint !== lastFingerprint) refreshMatches();
                lastFingerprint = fingerprint;
            } catch { /* Keep the last known job; a later poll can recover. */ }
            if (active) timer = window.setTimeout(poll, inProgress ? 5_000 : 30_000);
        };
        void poll();
        const onRequest = () => { window.clearTimeout(timer); void poll(); };
        window.addEventListener("dota-notes:sync-requested", onRequest);
        return () => { active = false; window.clearTimeout(timer); window.removeEventListener("dota-notes:sync-requested", onRequest); };
    }, []);
    return job;
}

function SyncNotice({ job, t }: { job: SyncJob | null; t: Messages }) {
    if (!job || !["pending", "processing", "failed"].includes(job.status)) return null;
    const inProgress = job.status !== "failed";
    return <p className="panel sync-notice" role="status">{inProgress ? t.syncRunning : t.syncFailed}{inProgress && <small>{job.result?.imported?.length || 0} {t.syncImported}</small>}</p>;
}

function useRows(query: HistoryQuery) {
    const [data, setData] = useState<MatchListResponse | null>(null);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const previousQuery = useRef("");
    useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener(refreshEvent, refresh); return () => window.removeEventListener(refreshEvent, refresh); }, []);
    useEffect(() => {
        const controller = new AbortController();
        const queryKey = [query.period, query.anchor, query.query, query.mode, query.position, query.page].join(":");
        if (queryKey !== previousQuery.current) setData(null);
        previousQuery.current = queryKey;
        setError("");
        void listMatches(query, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
            .catch(failure => { if (!controller.signal.aborted) setError(String(failure)); });
        return () => controller.abort();
    }, [query.period, query.anchor, query.query, query.mode, query.position, query.page, revision]);
    return { data, error };
}

function LiveDistribution({ t, registration, mode = "all", position = "all", query = "" }: {
    t: Messages; registration: string; mode?: string; position?: string; query?: string;
}) {
    const [period, setPeriod] = useState<Period>("week"), [anchor, setAnchor] = useState(today());
    const { data, error } = useRows({ period, anchor, query, mode, position, page: 1 });
    const summary = data?.summary || empty;
    const [hover, setHover] = useState<{ label: string; count: number; wins: number; losses: number; image: string } | null>(null);
    useEffect(() => setHover(null), [data]);
    const ring = (segments: Summary["heroes"], inner: number, outer: number, hero: boolean) => {
        let angle = 0;
        return segments.map((segment, index) => {
            const from = angle; angle += segment.count / summary.total * Math.PI * 2;
            const middle = (from + angle) / 2, radius = (inner + outer) / 2;
            const item = hero ? heroById(segment.id) : null;
            const image = hero && item ? heroIcon(item) : positionImage(segment.id);
            const label = hero ? item?.name || "—" : roles[segment.id];
            const enter = () => setHover({ ...segment, label, image });
            const color = hero ? heroPalette[index % heroPalette.length] : positionPalette[(segment.id - 1 + positionPalette.length) % positionPalette.length];
            return <g key={`${hero ? "hero" : "pos"}-${segment.id}`} className="ring-item" style={{ "--segment-color": color } as CSSProperties} tabIndex={0} role="button" aria-label={`${label}: ${segment.count} ${t.matches}, ${(segment.count / summary.total * 100).toFixed(1)}%, ${segment.wins} W, ${segment.losses} L`} onMouseEnter={enter} onMouseLeave={() => setHover(null)} onFocus={enter} onBlur={() => setHover(null)} onClick={enter}><path className={`ring-segment ${hero ? "hero-segment" : "position-segment"}`} d={ringArc(from, angle, inner, outer)}/>{image && angle - from > .19 && <image href={image} x={160 + Math.sin(middle) * radius - 12} y={160 - Math.cos(middle) * radius - 12} width={24} height={24} pointerEvents="none"/>}</g>;
        });
    };
    return <section className="panel distribution"><div className="section-heading"><div><p className="eyebrow">PLAYSTYLE</p><h2>{t.trend}</h2></div></div><PeriodControls {...{ period, setPeriod, anchor, setAnchor, t, registration }} maxDate={today()} compact/>{error && <p role="alert">{error}</p>}{summary.total ? <><div className="ring-wrapper"><svg viewBox="0 0 320 320" aria-label={t.trend}>{ring(summary.positions, 59, 100, false)}{ring(summary.heroes, 104, 150, true)}</svg><div className="ring-center">{hover ? <><img src={hover.image} alt=""/><strong>{(hover.count / summary.total * 100).toFixed(1)}%</strong><small>{hover.count} {t.matches}</small></> : <><strong>{summary.total}</strong><small>{t.matches}</small></>}</div></div><div className="ring-tooltip"><strong>{hover?.label || (period === "week" ? t.weekly : t.monthly)}</strong><span><b className="good">{hover?.wins ?? summary.wins} W</b><b className="bad">{hover?.losses ?? summary.losses} L</b></span></div><div className="role-legend">{summary.positions.map(s => <span key={s.id}><Position value={s.id} title={false}/><bdi>{(s.count / summary.total * 100).toFixed(0)}%</bdi></span>)}</div></> : !data ? <p className="empty-message">{t.checking}</p> : <p className="empty-message">{t.noData}</p>}</section>;
}

export function LiveMatches({ session, t, onOpen }: { session: Session; t: Messages; onOpen: (match: HistoryMatch) => void }) {
    const syncJob = useSyncFeed();
    const [period, setPeriod] = useState<Period>("week"), [anchor, setAnchor] = useState(today());
    const [query, setQuery] = useState(""), [mode, setMode] = useState("all"), [position, setPosition] = useState("all");
    const [page, setPage] = useState(1), [fetchOpen, setFetchOpen] = useState(false);
    useEffect(() => setPage(1), [period, anchor, query, mode, position]);
    const { data, error } = useRows({ period, anchor, query, mode, position, page });
    const registration = profileRegistrationDate(session);
    return <div className="screen-stack"><div className="page-heading"><h1>{t.matches}</h1><button className="primary-button" onClick={() => setFetchOpen(true)}><Download size={16}/>{t.fetchMatches}</button></div><div className="history-toolbar"><PeriodControls {...{ period, setPeriod, anchor, setAnchor, t, registration }} maxDate={today()}/><div className="filters"><label className="search-box"><Search size={16}/><input aria-label={t.search} placeholder={`${t.matchId} / Hero`} value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label={t.mode} value={mode} onChange={event => setMode(event.target.value)}><option value="all">{t.allModes}</option>{["Ranked", "Turbo", "All Pick"].map(value => <option key={value}>{value}</option>)}</select><select aria-label={t.position} value={position} onChange={event => setPosition(event.target.value)}><option value="all">{t.allPositions}</option>{roles.slice(1).map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></div></div><Stats summary={data?.summary || empty} t={t}/><SyncNotice job={syncJob} t={t}/><div className="history-grid"><section className="panel match-list"><div className="section-heading"><h2>{t.matches}</h2><small>{data?.total ?? 0} {t.matches}</small></div>{error && <p role="alert">{error}</p>}{!data && !error && <p className="empty-message">{t.checking}</p>}{data && <><MatchTable matches={data.rows} t={t} onOpen={onOpen} groupDays/>{!data.total && <p className="empty-message">{t.noData}</p>}<div className="pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t.previous}</button><span>{t.page} {page} {t.of} {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}</span><button disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage(p => p + 1)}>{t.next}</button></div></>}</section><LiveDistribution t={t} registration={registration} {...{ query, mode, position }}/></div>{fetchOpen && <LiveFetchDialog session={session} t={t} onClose={() => setFetchOpen(false)}/>}</div>;
}

export function LiveDashboard({ session, t, onOpen, onNavigate }: { session: Session; t: Messages; onOpen: (match: HistoryMatch) => void; onNavigate: (page: ShortcutPage) => void }) {
    const syncJob = useSyncFeed();
    const [period, setPeriod] = useState<Period>("week"), [anchor, setAnchor] = useState(today()), [fetchOpen, setFetchOpen] = useState(false);
    const { data, error } = useRows({ period, anchor, page: 1, query: "", mode: "all", position: "all" });
    const shortcuts: { page: ShortcutPage; label: string }[] = [{ page: "reports", label: t.reports }, { page: "replay", label: t.downloadReply }, { page: "matches", label: t.matches }, { page: "coach", label: t.coach }, { page: "farm", label: t.farm }, { page: "meta", label: t.meta }];
    return <div className="screen-stack"><section className="panel profile-banner"><Avatar session={session}/><div><p className="eyebrow">PLAYER PROFILE</p><h1><bdi>{session.displayName || session.username}</bdi></h1></div><div className="profile-period"><PeriodControls {...{ period, setPeriod, anchor, setAnchor, t }} registration={profileRegistrationDate(session)} maxDate={today()}/></div><button className="primary-button" onClick={() => setFetchOpen(true)}><Download size={16}/>{t.fetchMatches}</button></section><Stats summary={data?.summary || empty} t={t}/><SyncNotice job={syncJob} t={t}/><div className="shortcut-grid">{shortcuts.map(shortcut => <button key={shortcut.page} className="panel shortcut" onClick={() => onNavigate(shortcut.page)}><span>{shortcut.label}</span><ArrowUpRight size={14}/></button>)}</div><div className="history-grid"><section className="panel match-list"><div className="section-heading"><h2>{t.recent}</h2><button className="text-button" onClick={() => onNavigate("matches")}>{t.matches}<ArrowUpRight size={15}/></button></div>{error && <p role="alert">{error}</p>}{data ? <><MatchTable matches={data.rows} t={t} onOpen={onOpen} groupDays/>{!data.total && <p className="empty-message">{t.noData}</p>}</> : !error && <p className="empty-message">{t.checking}</p>}</section><LiveDistribution t={t} registration={profileRegistrationDate(session)}/></div>{fetchOpen && <LiveFetchDialog session={session} t={t} onClose={() => setFetchOpen(false)}/>}</div>;
}

function LiveFetchDialog({ session, t, onClose }: { session: Session; t: Messages; onClose: () => void }) {
    const [scope, setScope] = useState<Scope>("day"), [date, setDate] = useState(today());
    const [modes, setModes] = useState(["ranked", "turbo", "all_pick", "captains", "other"]);
    const [deadlines, setDeadlines] = useState<Record<Scope, number>>({ day: 0, week: 0, month: 0 });
    const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [activeJob, setActiveJob] = useState(false), [notice, setNotice] = useState("");
    useEffect(() => {
        let active = true;
        const refresh = () => void getSyncStatus().then(result => {
            if (!active) return;
            setDeadlines({ day: Date.parse(result.status.nextDayAllowedAt || "") || 0,
                week: Date.parse(result.status.nextWeekAllowedAt || "") || 0,
                month: Date.parse(result.status.nextMonthAllowedAt || "") || 0 });
            const running = ["pending", "processing"].includes(result.status.manualJob?.status || "");
            setActiveJob(running);
            if (result.status.manualJob?.status === "completed") setNotice(t.syncCompleted);
            if (result.status.manualJob?.status === "failed") setNotice(t.syncFailed);
        }).catch(failure => { if (active) setNotice(String(failure)); });
        refresh(); const clock = setInterval(() => { setNow(Date.now()); refresh(); }, 5_000);
        return () => { active = false; clearInterval(clock); };
    }, []);
    const registration = profileRegistrationDate(session), min = trackingStart(registration), range = requestRange(scope, date, registration, today());
    const remaining = Math.max(0, Math.ceil((deadlines[scope] - now) / 1000));
    async function submit() {
        if (!range || !modes.length || busy || remaining || activeJob) return;
        setBusy(true); setNotice("");
        try { await requestMatchSync({ scope, ...range, mode: "basic", gameModes: modes }); setActiveJob(true); window.dispatchEvent(new Event("dota-notes:sync-requested")); setNotice(t.syncQueued); }
        catch (failure) { setNotice(String(failure)); }
        finally { setBusy(false); }
    }
    return <Modal title={t.fetchMatches} onClose={onClose}><div className="segmented scope-switch">{(["day", "week", "month"] as const).map(value => <button key={value} aria-pressed={scope === value} className={scope === value ? "active" : ""} onClick={() => setScope(value)}>{t[value]}</button>)}</div><Calendar value={date} onChange={setDate} scope={scope} min={min} max={today()} t={t}/><p className="request-range"><bdi>{range ? `${range.from} — ${range.to}` : "—"}</bdi></p><small className="muted">{t.trackingSince}: <bdi>{min}</bdi></small><div className="mode-options">{["ranked", "turbo", "all_pick", "captains", "other"].map(value => <label key={value}><input type="checkbox" checked={modes.includes(value)} onChange={() => setModes(items => items.includes(value) ? items.filter(item => item !== value) : [...items, value])}/>{value}</label>)}</div><div className="cooldown-grid">{(["day", "week", "month"] as const).map(value => <div key={value}><span>{t[value]}</span><small>{Math.max(0, Math.ceil((deadlines[value] - now) / 1000))}s {t.remaining}</small></div>)}</div><button className="primary-button" disabled={!!remaining || !range || !modes.length || busy || activeJob} onClick={() => void submit()}>{activeJob ? t.checking : remaining ? `${t.readyIn} ${durationText(remaining)}` : t.fetchMatches}</button><p role="status" className="muted">{notice}</p></Modal>;
}
