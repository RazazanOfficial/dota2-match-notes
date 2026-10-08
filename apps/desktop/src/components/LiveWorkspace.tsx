import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight, Undo2, Download, Search, CircleHelp, LoaderCircle, Check, AlertCircle } from "lucide-react";
import { heroById, heroIcon } from "@/data/heroes";
import { positionImage } from "@/data/positions";
import type { Session } from "@/lib/types";
import { getSyncStatus, listMatches, matchListPath, requestMatchSync, type MatchListResponse, type SyncJob } from "../api";
import { durationText, periodRange, roles, type HistoryMatch, type HistoryQuery, type Period, type Scope, type Summary } from "../history";
import { isPersian, modeLabel, type Messages } from "../i18n";
import { Calendar, requestRange, trackingStart } from "./Calendar";
import { LoadingView } from "./LoadingView";
import { ErrorNotice } from "./ErrorNotice";
import { Avatar, profileRegistrationDate } from "./Shared";
import { MatchTable, Modal, ModeIcon, PeriodControls, Position, ringArc, Stats, type ShortcutPage } from "./Workspace";

import { cachedRead, cachedWrite, cachedHistory } from "../offlineCache";
import { connectionState, useConnection } from "../connection";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const empty: Summary = { total: 0, wins: 0, losses: 0, winRate: 0, score: null, heroes: [], positions: [] };
const refreshEvent = "dota-notes:matches-updated";
const refreshMatches = () => window.dispatchEvent(new Event(refreshEvent));
const heroPalette = ["#ec8e78", "#d4b170", "#75c9b1", "#86a9e9", "#bc98de", "#dd9dc5", "#84c8dc", "#b6c67b"];
const positionPalette = ["#dfa279", "#81bada", "#85c39d", "#b39ade", "#e1b782"];

function useSyncFeed() {
    const [job, setJob] = useState<SyncJob | null>(null);
    useEffect(() => {
        let active = true, timer = 0, sequence = 0, lastFingerprint = "";
        const poll = async () => {
            const current = ++sequence; window.clearTimeout(timer);
            let inProgress = false;
            try {
                if (connectionState() === "offline") { if (active) timer = window.setTimeout(poll,15000); return; }
                const { status } = await getSyncStatus();
                if (!active || current !== sequence) return;
                const next = status.manualJob || null; setJob(next);
                inProgress = next?.status === "pending" || next?.status === "processing";
                const fingerprint = next ? `${next.id}:${next.status}:${next.attempted?.length ?? 0}:${next.result?.imported?.length ?? 0}` : "";
                if (fingerprint && fingerprint !== lastFingerprint) refreshMatches();
                lastFingerprint = fingerprint;
            } catch { inProgress = true; }
            if (active && current === sequence) timer = window.setTimeout(poll, inProgress ? 5_000 : 30_000);
        };
        void poll();
        const onRequest = (event: Event) => { const detail = (event as CustomEvent<SyncJob>).detail; if (detail) setJob(detail); void poll(); };
        window.addEventListener("dota-notes:sync-requested", onRequest);
        return () => { active = false; sequence++; window.clearTimeout(timer); window.removeEventListener("dota-notes:sync-requested", onRequest); };
    }, []);
    return job;
}

function SyncNotice({ job, t }: { job: SyncJob | null; t: Messages }) {
    if (!job || !["pending", "processing", "failed"].includes(job.status)) return null;
    const failed = job.status === "failed", pending = job.status === "pending";
    return <section className={`panel sync-notice ${failed ? "sync-error" : ""}`} role="status" aria-live="polite">
        <div className="sync-symbol">{failed ? <AlertCircle size={19}/> : <Download size={19}/>}</div>
        <div className="sync-content"><div className="sync-title"><strong>{failed ? t.syncFailed : pending ? t.syncPending : t.syncProcessing}</strong>{!failed && <span className="live-pill"><i/>{t.syncLive}</span>}</div>
        {job.request && <small className="sync-range"><span>{t[job.request.scope]}</span><bdi className="latin-digits">{job.request.from} — {job.request.to}</bdi></small>}
        <div className="sync-counters"><span><LoaderCircle size={13} className={!failed ? "spin" : ""}/><bdi>{job.result?.checked ?? job.attempted?.length ?? 0}</bdi>{t.syncScanned}</span><span><Check size={13}/><bdi>{job.result?.imported?.length ?? 0}</bdi>{t.syncImported}</span></div>
        {!failed && <div className="sync-activity"><i/></div>}</div>
    </section>;
}
export function useRows(query: HistoryQuery, collectAll = false) {
    const path = matchListPath(query), key = collectAll ? `range:${path}` : path;
    const connection = useConnection();
    const [state,setState] = useState<{key:string;data:MatchListResponse|null;error:unknown}>(()=>({key,data:cachedRead(key) || cachedHistory(query,collectAll),error:null}));
    const [refreshing,setRefreshing]=useState(false);
    const [revision,setRevision] = useState(0);
    useEffect(()=>{ const refresh=()=>setRevision(value=>value+1); window.addEventListener(refreshEvent,refresh); return ()=>window.removeEventListener(refreshEvent,refresh); },[]);
    useEffect(()=>{
        const controller=new AbortController(); let timer=0;
        const load=async()=>{
            setRefreshing(true);
            try {
                if (connectionState()==="offline" && cachedRead(key)) { setState({key,data:cachedRead(key),error:null}); return; }
                let result=await listMatches(query,controller.signal);
                let rows=result.rows;
                if (collectAll) {
                    for (let page=2; rows.length<result.total && page<=100; page++) {
                        const next=await listMatches({...query,page},controller.signal);
                        if (!next.rows.length) break;
                        rows=[...rows,...next.rows]; result={...next,page:1,rows};
                    }
                }
                if (controller.signal.aborted) return;
                cachedWrite(key,result); setState({key,data:result,error:null});
                const running=result.rows.some(row=>["pending","processing"].includes(row.analysisStatus || ""));
                if (connectionState()==="online" && (result.summaryPending || running)) timer=window.setTimeout(load,result.summaryPending?2000:5000);
            } catch(failure) {
                if (!controller.signal.aborted) {
                    const previous=cachedRead<MatchListResponse>(key) || cachedHistory(query,collectAll);
                    setState({key,data:previous,error:previous && connectionState()==="offline" ? null : failure});
                }
            } finally { if (!controller.signal.aborted) setRefreshing(false); }
        };
        void load(); return ()=>{controller.abort();window.clearTimeout(timer);};
    },[key,revision,connection]);
    const current=state.key===key?state:{key,data:cachedRead<MatchListResponse>(key) || cachedHistory(query,collectAll),error:null};
    return {...current,refreshing,initialLoading:!current.data && !current.error};
}

export function LiveDistribution({ t, registration, mode = "all", position = "all", query = "", hero = "all", onFilter, onReset }: {
    t: Messages; registration: string; mode?: string; position?: string; query?: string; hero?: string; onFilter: (hero:string,position:string,period:Period,anchor:string)=>void; onReset:()=>void;
}) {
    const [period, setPeriod] = useState<Period>("week"), [anchor, setAnchor] = useState(today());
    const { data, error } = useRows({ period, anchor, query, mode, position, hero, page: 1, pageSize:10 });
    const summary = data?.summary || empty;
    const [hover, setHover] = useState<{ label: string; count: number; wins: number; losses: number; image: string } | null>(null);
    useEffect(() => setHover(null), [data]);
    const selectedHero = hero;
    const ring = (segments: Summary["heroes"], inner: number, outer: number, hero: boolean) => {
        let angle = 0;
        return segments.map((segment, index) => {
            const from = angle; angle += segment.count / summary.total * Math.PI * 2;
            const middle = (from + angle) / 2, radius = (inner + outer) / 2;
            const item = hero ? heroById(segment.id) : null;
            const image = hero && item ? heroIcon(item) : segment.id ? positionImage(segment.id) : "";
            const label = hero ? item?.name || "—" : roles[segment.id] || t.unknownPosition;
            const enter = () => setHover({ ...segment, label, image });
            const select = () => onFilter(hero ? String(segment.id) : selectedHero, hero ? position : String(segment.id), period, anchor);
            const color = !hero && !segment.id ? "#8490a4" : hero ? heroPalette[index % heroPalette.length] : positionPalette[(segment.id - 1 + positionPalette.length) % positionPalette.length];
            return <g key={`${hero ? "hero" : "pos"}-${segment.id}`} className="ring-item" style={{ "--segment-color": color } as CSSProperties} tabIndex={0} role="button" aria-label={`${label}: ${segment.count} ${t.matches}, ${(segment.count / summary.total * 100).toFixed(1)}%, ${segment.wins} W, ${segment.losses} L`} onMouseEnter={enter} onMouseLeave={() => setHover(null)} onFocus={enter} onBlur={() => setHover(null)} onClick={select} onKeyDown={event=>{if(event.key==="Enter" || event.key===" "){event.preventDefault();select();}}}><path className={`ring-segment ${hero ? "hero-segment" : "position-segment"}`} d={ringArc(from, angle, inner, outer)}/>{image && angle - from > .19 && <image href={image} x={160 + Math.sin(middle) * radius - 12} y={160 - Math.cos(middle) * radius - 12} width={24} height={24} pointerEvents="none"/>}{!hero && !segment.id && angle - from > .19 && <g pointerEvents="none"><circle cx={160 + Math.sin(middle) * radius} cy={160 - Math.cos(middle) * radius} r={10} fill="#101724"/><text x={160 + Math.sin(middle) * radius} y={160 - Math.cos(middle) * radius + 5} textAnchor="middle" fill="#e0e8f7" fontSize={17}>?</text></g>}</g>;
        });
    };
    return <section className="panel distribution sticky-distribution"><div className="section-heading"><div><p className="eyebrow">PLAYSTYLE</p><h2>{t.trend}</h2></div></div><PeriodControls {...{ period, setPeriod, anchor, setAnchor, t, registration }} maxDate={today()} compact/>{!!error && !data && <ErrorNotice error={error} t={t}/>}{summary.total ? <><div className="ring-wrapper"><svg viewBox="0 0 320 320" aria-label={t.trend}>{ring(summary.positions, 59, 100, false)}{ring(summary.heroes, 104, 150, true)}</svg><div className="ring-center">{(hero !== "all" || position !== "all") && <button className="chart-reset" aria-label={t.resetFilters} onClick={onReset}><Undo2 size={19}/></button>}{hover ? <>{hover.image ? <img src={hover.image} alt=""/> : <CircleHelp size={26}/>}<strong>{(hover.count / summary.total * 100).toFixed(1)}%</strong><small>{hover.count} {t.matches}</small></> : hero !== "all" || position !== "all" ? <>{hero !== "all" && heroById(Number(hero)) ? <img src={heroIcon(heroById(Number(hero))!)} alt=""/> : position !== "all" && Number(position) ? <img src={positionImage(Number(position))} alt=""/> : <CircleHelp size={26}/>}<strong>100.0%</strong><small>{summary.total} {t.matches}</small></> : <><strong>{summary.total}</strong><small>{t.matches}</small></>}</div></div><div className="ring-tooltip"><strong>{hover?.label || (period === "week" ? t.weekly : t.monthly)}</strong><span><b className="good">{hover?.wins ?? summary.wins} W</b><b className="bad">{hover?.losses ?? summary.losses} L</b></span></div><div className="role-legend">{summary.positions.map(s => <span key={s.id}><Position value={s.id} title={false} t={t}/><bdi>{(s.count / summary.total * 100).toFixed(0)}%</bdi></span>)}</div></> : !data && !error ? <LoadingView t={t}/> : data ? <>{(hero !== "all" || position !== "all") && <button className="chart-reset" aria-label={t.resetFilters} onClick={onReset}><Undo2 size={19}/></button>}<p className="empty-message">{t.noData}</p></> : null}</section>;
}

function ChartFilters({t,registration,mode,query,hero,position,onFilter,onReset}: {t:Messages;registration:string;mode?:string;query?:string;hero:string;position:string;onFilter:(hero:string,position:string,period:Period,anchor:string)=>void;onReset:()=>void}) {
    return <LiveDistribution {...{t,registration,mode,query,hero,position,onFilter,onReset}}/>;
}
export function LiveMatches({ session,t,onOpen }: {session:Session;t:Messages;onOpen:(match:HistoryMatch)=>void}) {
    const syncJob=useSyncFeed();
    const [period,setPeriod]=useState<Period>("week"),[anchor,setAnchor]=useState(today());
    const [query,setQuery]=useState(""),[mode,setMode]=useState("all"),[position,setPosition]=useState("all"),[hero,setHero]=useState("all"),[fetchOpen,setFetchOpen]=useState(false);
    const {data,error}=useRows({period,anchor,query,mode,position,hero,page:1,pageSize:100},true);
    const registration=profileRegistrationDate(session);
    const filter=(hero:string,position:string,period:Period,anchor:string)=>{setHero(hero);setPosition(position);setPeriod(period);setAnchor(anchor);};
    return <div className="screen-stack"><div className="page-heading"><h1>{t.matches}</h1><button className="primary-button" onClick={()=>setFetchOpen(true)}><Download size={16}/>{t.fetchMatches}</button></div><div className="history-toolbar"><PeriodControls {...{period,setPeriod,anchor,setAnchor,t,registration}} maxDate={today()}/><div className="filters"><label className="search-box"><Search size={16}/><input aria-label={t.search} placeholder={`${t.matchId} / Hero`} value={query} onChange={event=>setQuery(event.target.value)}/></label><select aria-label={t.mode} value={mode} onChange={event=>setMode(event.target.value)}><option value="all">{t.allModes}</option>{["Ranked","Turbo","All Pick","Captains Mode","Captains Draft","Single Draft","All Random","Random Draft","Ability Draft","Other"].map(value=><option key={value} value={value}>{modeLabel(value,t)}</option>)}</select><select aria-label={t.position} value={position} onChange={event=>setPosition(event.target.value)}><option value="all">{t.allPositions}</option><option value="0">{t.unknownPosition}</option>{roles.slice(1).map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select></div></div>{data && <Stats summary={data.summary} t={t}/>}<SyncNotice job={syncJob} t={t}/><div className="history-grid"><section className="panel match-list"><div className="section-heading"><h2>{t.matches}</h2>{data && <small>{data.total} {t.matches}</small>}</div>{!!error && <ErrorNotice error={error} t={t}/>} {!data && !error && <LoadingView t={t}/>} {data && <><MatchTable matches={data.rows} t={t} onOpen={onOpen} groupDays live/>{!data.total && <p className="empty-message">{t.noData}</p>}</>}</section><ChartFilters {...{t,registration,query,mode,position,hero}} onFilter={filter} onReset={()=>{setHero("all");setPosition("all");}}/></div>{fetchOpen && <LiveFetchDialog session={session} t={t} onClose={()=>setFetchOpen(false)}/>}</div>;
}
export function LiveDashboard({session,t,onOpen,onNavigate}: {session:Session;t:Messages;onOpen:(match:HistoryMatch)=>void;onNavigate:(page:ShortcutPage)=>void}) {
    const syncJob=useSyncFeed();
    const [period,setPeriod]=useState<Period>("week"),[anchor,setAnchor]=useState(today()),[fetchOpen,setFetchOpen]=useState(false);
    const [page,setPage]=useState(1),[visible,setVisible]=useState(10),[hero,setHero]=useState("all"),[position,setPosition]=useState("all");
    const {data,error,refreshing}=useRows({period,anchor,page:1,offset:(page-1)*30,query:"",mode:"all",position,hero,pageSize:visible});
    useEffect(()=>{setPage(1);setVisible(10);},[period,anchor,hero,position]);
    const shortcuts: {page:ShortcutPage;label:string}[]=[{page:"reports",label:t.reports},{page:"replay",label:t.downloadReply},{page:"matches",label:t.matches},{page:"coach",label:t.coach},{page:"farm",label:t.farm},{page:"meta",label:t.meta}];
    const filter=(hero:string,position:string,period:Period,anchor:string)=>{setHero(hero);setPosition(position);setPeriod(period);setAnchor(anchor);};
    return <div className="screen-stack"><section className="panel profile-banner"><Avatar session={session}/><div><p className="eyebrow">PLAYER PROFILE</p><h1><bdi>{session.displayName || session.username}</bdi></h1></div><div className="profile-period"><PeriodControls {...{period,setPeriod,anchor,setAnchor,t}} registration={profileRegistrationDate(session)} maxDate={today()}/></div><button className="primary-button" onClick={()=>setFetchOpen(true)}><Download size={16}/>{t.fetchMatches}</button></section>{data && <Stats summary={data.summary} t={t}/>}<SyncNotice job={syncJob} t={t}/><div className="shortcut-grid">{shortcuts.map(shortcut=><button key={shortcut.page} className="panel shortcut" onClick={()=>onNavigate(shortcut.page)}><span>{shortcut.label}</span><ArrowUpRight size={15}/></button>)}</div><div className="history-grid"><section className="panel match-list"><div className="section-heading"><h2>{t.recent}</h2><button className="text-button" onClick={()=>onNavigate("matches")}>{t.matches}<ArrowUpRight size={15}/></button></div>{!!error && <ErrorNotice error={error} t={t}/>} {data ? <><MatchTable matches={data.rows.slice(0,visible)} t={t} onOpen={onOpen} groupDays live/>{!data.total && <p className="empty-message">{t.noData}</p>}{visible < Math.min(30,data.total-(page-1)*30) && <button className="load-more secondary-button" disabled={refreshing} onClick={()=>setVisible(count=>Math.min(30,count+10))}>{t.loadMore}</button>}{(visible >= 30 || page>1) && data.total>30 && <div className="pagination"><button disabled={page<=1} onClick={()=>{setPage(value=>value-1);setVisible(10);}}>{t.previous}</button><span>{t.page} {page} {t.of} {Math.ceil(data.total/30)}</span><button disabled={page*30>=data.total} onClick={()=>{setPage(value=>value+1);setVisible(10);}}>{t.next}</button></div>}</> : !error && <LoadingView t={t}/>}</section><ChartFilters t={t} registration={profileRegistrationDate(session)} {...{hero,position}} onFilter={filter} onReset={()=>{setHero("all");setPosition("all");}}/></div>{fetchOpen && <LiveFetchDialog session={session} t={t} onClose={()=>setFetchOpen(false)}/>}</div>;
}

function LiveFetchDialog({ session, t, onClose }: { session: Session; t: Messages; onClose: () => void }) {
    const [scope, setScope] = useState<Scope>("day"), [date, setDate] = useState(today());
    const [modes, setModes] = useState(["ranked", "turbo", "all_pick", "captains", "other"]);
    const cachedStatus = cachedRead<Awaited<ReturnType<typeof getSyncStatus>>>("/api/sync/me")?.status;
    const [deadlines, setDeadlines] = useState<Record<Scope, number>>({day:Date.parse(cachedStatus?.nextDayAllowedAt || "") || 0,week:Date.parse(cachedStatus?.nextWeekAllowedAt || "") || 0,month:Date.parse(cachedStatus?.nextMonthAllowedAt || "") || 0});
    const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [activeJob, setActiveJob] = useState(false), [notice, setNotice] = useState(""), [loaded, setLoaded] = useState(!!cachedStatus);
    useEffect(() => {
        let active = true;
        const refresh = () => void getSyncStatus().then(result => {
            if (!active) return;
            setDeadlines({ day: Date.parse(result.status.nextDayAllowedAt || "") || 0,
                week: Date.parse(result.status.nextWeekAllowedAt || "") || 0,
                month: Date.parse(result.status.nextMonthAllowedAt || "") || 0 });
            const running = ["pending", "processing"].includes(result.status.manualJob?.status || "");
            setActiveJob(running);
            setLoaded(true); setNotice("");
        }).catch(failure => { if (active) { setNotice(connectionState()==="offline" ? "" : String(failure)); setLoaded(false); } });
        refresh(); const clock = setInterval(() => { setNow(Date.now()); refresh(); }, 5_000);
        return () => { active = false; clearInterval(clock); };
    }, []);
    const registration = profileRegistrationDate(session), min = trackingStart(registration), range = requestRange(scope, date, registration, today());
    const remaining = Math.max(0, Math.ceil((deadlines[scope] - now) / 1000));
    async function submit() {
        if (connectionState() === "offline") { setNotice(t.offlineRequired); return; }
        if (!loaded || !range || !modes.length || busy || remaining || activeJob) return;
        setBusy(true); setNotice("");
        try { const result = await requestMatchSync({ scope, ...range, mode: "basic", gameModes: modes }); window.dispatchEvent(new CustomEvent("dota-notes:sync-requested", { detail: { id: result.jobId, status: "pending", request: { scope, ...range }, result: { imported: [], checked: 0 } } })); onClose(); }
        catch (failure) { setNotice(connectionState()==="offline" ? t.offlineRequired : String(failure)); }
        finally { setBusy(false); }
    }

    return <Modal title={t.fetchMatches} onClose={onClose}><div className="segmented scope-switch">{(["day", "week", "month"] as const).map(value => <button key={value} aria-pressed={scope === value} className={scope === value ? "active" : ""} onClick={() => setScope(value)}>{t[value]}</button>)}</div><Calendar value={date} onChange={setDate} scope={scope} min={min} max={today()} t={t}/><p className="request-range"><bdi>{range ? `${range.from} — ${range.to}` : "—"}</bdi></p><small className="muted">{t.trackingSince}: <bdi>{min}</bdi></small><fieldset className="mode-picker"><legend>{t.modesTitle}</legend><div className="mode-options">{Object.entries({ ranked: "Ranked", turbo: "Turbo", all_pick: "All Pick", captains: "Captains Mode", other: "Other" }).map(([value, label]) => <label className={modes.includes(value) ? "selected" : ""} key={value}><input type="checkbox" checked={modes.includes(value)} onChange={() => setModes(items => items.includes(value) ? items.filter(item => item !== value) : [...items, value])}/><ModeIcon mode={label} t={t}/><Check size={13}/></label>)}</div></fieldset><div className="cooldown-grid">{(["day", "week", "month"] as const).map(value => <div key={value}><span>{t[value]}</span><small>{Math.max(0, Math.ceil((deadlines[value] - now) / 1000))}s {t.remaining}</small></div>)}</div><button className="primary-button" disabled={(!loaded && connectionState() !== "offline") || !!remaining || !range || !modes.length || busy || activeJob} onClick={() => void submit()}>{busy || (!loaded && connectionState() !== "offline") ? t.checking : activeJob ? t.syncRunning : remaining ? `${t.readyIn} ${durationText(remaining)}` : t.fetchMatches}</button>{notice && <p role="alert" className="fetch-error">{notice}</p>}</Modal>;
}
