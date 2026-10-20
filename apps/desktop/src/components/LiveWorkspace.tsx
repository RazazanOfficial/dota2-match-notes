import { useEffect, useState } from "react";
import { ArrowUpRight, Download, Search, LoaderCircle, Check, AlertCircle } from "lucide-react";
import type { Session } from "@/lib/types";
import { getSyncStatus, listMatches, matchListPath, requestMatchSync, type MatchListResponse, type SyncJob } from "../api";
import { durationText, roles, type HistoryMatch, type HistoryQuery, type Scope } from "../history";
import { modeLabel, type Messages } from "../i18n";
import { Calendar, requestRange, trackingStart } from "./Calendar";
import { LoadingView } from "./LoadingView";
import { ErrorNotice } from "./ErrorNotice";
import { profileRegistrationDate } from "./Shared";
import { MatchTable, Modal, ModeIcon, type ShortcutPage } from "./Workspace";

import { DashboardHeader, PeriodControls } from "./DashboardControls";
import { HeroPositionDistribution } from "./HeroPositionDistribution";
import { Stats } from "./DashboardStats";
import { useHistoryPeriod } from "../hooks/useHistoryPeriod";
import { cachedRead, cachedWrite, cachedHistory } from "../offlineCache";
import { connectionState, useConnection } from "../connection";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const refreshEvent = "dota-notes:matches-updated";
const refreshMatches = () => window.dispatchEvent(new Event(refreshEvent));

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
    useEffect(()=>{
        const controller=new AbortController();
        let timer=0, inFlight=false, refreshAgain=false;
        const load=async()=>{
            if (controller.signal.aborted) return;
            if (inFlight) { refreshAgain=true; return; }
            window.clearTimeout(timer); inFlight=true; setRefreshing(true);
            let delay=30_000;
            try {
                if (connectionState()==="offline") {
                    const previous=cachedRead<MatchListResponse>(key) || cachedHistory(query,collectAll);
                    if (previous) setState({key,data:previous,error:null});
                    return;
                }
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
                const running=result.rows.some(row=>["pending","queued","processing"].includes(row.analysisPreparation?.replay || row.analysisStatus || ""));
                delay=result.summaryPending ? 2_000 : running ? 5_000 : 30_000;
            } catch(failure) {
                if (!controller.signal.aborted) {
                    const previous=cachedRead<MatchListResponse>(key) || cachedHistory(query,collectAll);
                    setState({key,data:previous,error:previous && connectionState()==="offline" ? null : failure});
                    delay=10_000;
                }
            } finally {
                inFlight=false;
                if (!controller.signal.aborted) {
                    setRefreshing(false);
                    // Retry after transient failures and refresh idle rows too: a job
                    // may have been started elsewhere, or completed while hidden.
                    if (connectionState()!=="offline") timer=window.setTimeout(load,refreshAgain ? 0 : delay);
                    refreshAgain=false;
                }
            }
        };
        const refresh=()=>{if(connectionState()!=="offline") void load();};
        const visible=()=>{if(document.visibilityState==="visible") refresh();};
        window.addEventListener(refreshEvent,refresh);
        window.addEventListener("focus",refresh);
        document.addEventListener("visibilitychange",visible);
        void load();
        return ()=>{
            controller.abort(); window.clearTimeout(timer);
            window.removeEventListener(refreshEvent,refresh);
            window.removeEventListener("focus",refresh);
            document.removeEventListener("visibilitychange",visible);
        };
    },[key,connection]);
    const current=state.key===key?state:{key,data:cachedRead<MatchListResponse>(key) || cachedHistory(query,collectAll),error:null};
    return {...current,refreshing,initialLoading:!current.data && !current.error};
}

export function LiveMatches({ session,t,onOpen }: {session:Session;t:Messages;onOpen:(match:HistoryMatch)=>void}) {
    const syncJob=useSyncFeed();
    const [period,setPeriod]=useHistoryPeriod(session);
    const [anchor,setAnchor]=useState(today());
    const [query,setQuery]=useState(""),[mode,setMode]=useState("all"),[position,setPosition]=useState("all"),[hero,setHero]=useState("all"),[fetchOpen,setFetchOpen]=useState(false);
    const {data,error}=useRows({period,anchor,query,mode,position,hero,page:1,pageSize:100},true);
    const registration=profileRegistrationDate(session);
    const filter=(hero:string,position:string)=>{setHero(hero);setPosition(position);};
    return <div className="screen-stack"><div className="page-heading"><h1>{t.matches}</h1><button className="primary-button" onClick={()=>setFetchOpen(true)}><Download size={16}/>{t.fetchMatches}</button></div><div className="history-toolbar"><PeriodControls {...{period,setPeriod,anchor,setAnchor,t,registration}} maxDate={today()}/><div className="filters"><label className="search-box"><Search size={16}/><input aria-label={t.search} placeholder={`${t.matchId} / Hero`} value={query} onChange={event=>setQuery(event.target.value)}/></label><select aria-label={t.mode} value={mode} onChange={event=>setMode(event.target.value)}><option value="all">{t.allModes}</option>{["Ranked","Turbo","All Pick","Captains Mode","Captains Draft","Single Draft","All Random","Random Draft","Ability Draft","Other"].map(value=><option key={value} value={value}>{modeLabel(value,t)}</option>)}</select><select aria-label={t.position} value={position} onChange={event=>setPosition(event.target.value)}><option value="all">{t.allPositions}</option><option value="0">{t.unknownPosition}</option>{roles.slice(1).map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select></div></div>{data && <Stats summary={data.summary} t={t} hero={hero} position={position} filtered={Boolean(query) || mode !== "all"}/>}<SyncNotice job={syncJob} t={t}/><div className="history-grid"><section className="panel match-list"><div className="section-heading"><h2>{t.matches}</h2>{data && <small>{data.total} {t.matches}</small>}</div>{!!error && <ErrorNotice error={error} t={t}/>} {!data && !error && <LoadingView t={t}/>} {data && <><MatchTable matches={data.rows} t={t} onOpen={onOpen} groupDays live/>{!data.total && <p className="empty-message">{t.noData}</p>}</>}</section><HeroPositionDistribution summary={data?.summary || null} {...{t,period,position,hero}} onFilter={filter} onReset={()=>{setHero("all");setPosition("all");}}/></div>{fetchOpen && <LiveFetchDialog session={session} t={t} onClose={()=>setFetchOpen(false)}/>}</div>;
}
export function LiveDashboard({session,t,onOpen,onNavigate}: {session:Session;t:Messages;onOpen:(match:HistoryMatch)=>void;onNavigate:(page:ShortcutPage)=>void}) {
    const syncJob=useSyncFeed();
    const [period,setPeriod]=useHistoryPeriod(session);
    const [anchor,setAnchor]=useState(today()),[fetchOpen,setFetchOpen]=useState(false);
    const [page,setPage]=useState(1),[visible,setVisible]=useState(10),[hero,setHero]=useState("all"),[position,setPosition]=useState("all");
    const {data,error,refreshing}=useRows({period,anchor,page:1,offset:(page-1)*30,query:"",mode:"all",position,hero,pageSize:visible});
    useEffect(()=>{setPage(1);setVisible(10);},[period,anchor,hero,position]);

    const filter=(hero:string,position:string)=>{setHero(hero);setPosition(position);};
    return <div className="screen-stack"><DashboardHeader session={session} {...{period,setPeriod,anchor,setAnchor,t}} maxDate={today()} onFetch={()=>setFetchOpen(true)}/>{data && <Stats summary={data.summary} t={t} hero={hero} position={position}/>}<SyncNotice job={syncJob} t={t}/><div className="history-grid"><section className="panel match-list"><div className="section-heading"><h2>{t.recent}</h2><button className="text-button" onClick={()=>onNavigate("matches")}>{t.matches}<ArrowUpRight size={15}/></button></div>{!!error && <ErrorNotice error={error} t={t}/>} {data ? <><MatchTable matches={data.rows.slice(0,visible)} t={t} onOpen={onOpen} groupDays live/>{!data.total && <p className="empty-message">{t.noData}</p>}{visible < Math.min(30,data.total-(page-1)*30) && <button className="load-more secondary-button" disabled={refreshing} onClick={()=>setVisible(count=>Math.min(30,count+10))}>{t.loadMore}</button>}{(visible >= 30 || page>1) && data.total>30 && <div className="pagination"><button disabled={page<=1} onClick={()=>{setPage(value=>value-1);setVisible(10);}}>{t.previous}</button><span>{t.page} {page} {t.of} {Math.ceil(data.total/30)}</span><button disabled={page*30>=data.total} onClick={()=>{setPage(value=>value+1);setVisible(10);}}>{t.next}</button></div>}</> : !error && <LoadingView t={t}/>}</section><HeroPositionDistribution summary={data?.summary || null} {...{t,period,hero,position}} onFilter={filter} onReset={()=>{setHero("all");setPosition("all");}}/></div>{fetchOpen && <LiveFetchDialog session={session} t={t} onClose={()=>setFetchOpen(false)}/>}</div>;
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
