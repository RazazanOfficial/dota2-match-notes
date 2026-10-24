import {memo,useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {Download,Film,FolderOpen,HardDrive,RefreshCw,Search,Settings2,Check,ChevronDown} from "lucide-react";
import type {Session} from "@/lib/types";
import {sampleHistory,periodRange,SAMPLE_DATE,type HistoryMatch} from "../history";
import {cacheOwner,cachedRead,cachedWrite} from "../offlineCache";
import {apiRequest,API_ORIGIN,getBearer,matchListPath} from "../api";
import {isPersian,type Messages} from "../i18n";
import {replayNative,validReplayId,type ReplayFile,type ReplaySettings} from "../replays";
import {TaskManager} from "../taskManager";
import {deferWork} from "../experience";
import {connectionState,useConnection} from "../connection";
import {useHistoryPeriod} from "../hooks/useHistoryPeriod";
import {useTaskManager} from "./TaskCenter";
import {PeriodControls} from "./DashboardControls";
import {HistoryFilters} from "./HistoryFilters";
import {ReplaySetupGuide} from "./ReplaySetupGuide";
import {ReplayMatchHeader,ReplayMatchRow,type ReplayMatchInfo} from "./ReplayMatchRow";
import {useReplayMatchInfo} from "../replayMatchInfo";
import {CopyValue,previewProfile,profileRegistrationDate} from "./Shared";
import {ErrorNotice,errorCode} from "./ErrorNotice";
import {AnimatedContent} from "./AnimatedContent";
const noopSubscribe=()=>()=>{};
const emptySnapshot=()=>null;
const dateNow=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const LibraryRows=memo(function LibraryRows({rows,files,metadata,t,onDownload,busy,queued="",label}:{rows:string[];files?:ReplayFile[];metadata:Record<string,ReplayMatchInfo>;t:Messages;onDownload?:(id:string)=>void;busy:boolean;queued?:string;label:string}){
 return <div className="replay-library-scroll" data-native-scroll><div className={`replay-match-table ${onDownload?"with-download":""}`} role="table" aria-label={label}><ReplayMatchHeader t={t} downloadable={!!onDownload}/>{rows.map(id=><ReplayMatchRow key={id} matchId={id} info={metadata[id]} file={files?.find(file=>file.matchId===id)} t={t} disabled={busy||queued.split(",").includes(id)} queued={queued.split(",").includes(id)} onDownload={onDownload?()=>onDownload(id):undefined}/>)}</div></div>;
});
function TransferLane({manager,t}:{manager:TaskManager|null;t:Messages}){
 const snapshot=useSyncExternalStore(manager?.subscribe||noopSubscribe,manager?.snapshot||emptySnapshot),fa=isPersian(t);
 const tasks=snapshot?.downloads.filter(task=>["preparing","transferring"].includes(task.status))||[];
 if(!tasks.length){const failed=snapshot?.downloads.slice().reverse().find(task=>task.status==="failed");return failed?<ErrorNotice code={failed.errorCode} t={t}/>:null;}const task=tasks.find(task=>task.status==="transferring")||tasks[0],percent=task.totalBytes?Math.min(100,Math.round(task.bytes/task.totalBytes*100)):null;
 const remaining=task.totalBytes&&task.speed>0?Math.ceil((task.totalBytes-task.bytes)/task.speed):null;
 return <section className="replay-download-lane" role="status"><span className="download-lane-icon"><Download size={20}/></span><div><header><CopyValue value={task.matchId} t={t}/><strong>{task.status==="preparing"?(fa?"در انتظار آماده‌شدن ریپلی":"Preparing replay"):task.phase==="finalizing"?(fa?"ذخیرهٔ فایل محلی":"Finalizing local file"):(fa?"درحال دانلود":"Downloading")}</strong></header><progress max={100} value={task.status==="transferring"?percent??undefined:undefined}/><footer><bdi>{(task.bytes/1048576).toFixed(1)}{task.totalBytes?` / ${(task.totalBytes/1048576).toFixed(1)}`:""} MB</bdi><span>{task.speed>0?`${(task.speed/1048576).toFixed(1)} MB/s`:""}{remaining!=null?` · ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}`:""}</span></footer></div>{tasks.length>1&&<small>+{tasks.length-1}</small>}</section>;
}
export function Replay({t,live=false,session=previewProfile}:{t:Messages;live?:boolean;session?:Session}){
 const connection=useConnection();
 const fa=isPersian(t),native=replayNative.available(),parentManager=useTaskManager(),owner=cacheOwner();
 const fallback=useMemo(()=>parentManager?null:new TaskManager(owner||"replay-local",live,false),[parentManager,owner,live]);
 const manager=parentManager||fallback;
 useEffect(()=>{fallback?.start();return()=>fallback?.stop();},[fallback]);
 const busySnapshot=useCallback(()=>!!manager?.snapshot().downloads.some(task=>["preparing","transferring"].includes(task.status)),[manager]);
 const globalBusy=useSyncExternalStore(manager?.subscribe||noopSubscribe,busySnapshot,()=>false);
 const queuedSnapshot=useCallback(()=>manager?.snapshot().downloads.filter(task=>["preparing","transferring"].includes(task.status)).map(task=>task.matchId).join(",")||"",[manager]);
 const queued=useSyncExternalStore(manager?.subscribe||noopSubscribe,queuedSnapshot,()=>"");
 const [tab,setTab]=useState<"find"|"local">("find"),[period,setPeriod]=useHistoryPeriod(session),[anchor,setAnchor]=useState(live?dateNow():SAMPLE_DATE);
 const [mode,setMode]=useState("all"),[position,setPosition]=useState("all"),[query,setQuery]=useState(""),[id,setId]=useState(""),[searched,setSearched]=useState("");
 const [page,setPage]=useState(1),[total,setTotal]=useState(0);
 const historyPath=matchListPath({period,anchor,mode,position,query,page,pageSize:30});
 useEffect(()=>{setPage(1);setHistoryLimit(10);},[period,anchor,mode,position,query]);
 const [recent,setRecent]=useState<HistoryMatch[]>([]),[historyLoading,setHistoryLoading]=useState(live),[historyLimit,setHistoryLimit]=useState(10);
 const [settings,setSettings]=useState<ReplaySettings>({dotaPath:null,replayPath:null}),[files,setFiles]=useState<ReplayFile[]>([]),[localLimit,setLocalLimit]=useState(10);
 const [busy,setBusy]=useState(""),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(""),[configOpen,setConfigOpen]=useState(false),[nativeLoading,setNativeLoading]=useState(native),[searching,setSearching]=useState(false),[revision,setRevision]=useState(0);
 const mounted=useRef(true),searchRequest=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;searchRequest.current?.abort();};},[]);
 const history=useMemo(()=>live?recent:sampleHistory.filter(row=>(mode==="all"||row.mode===mode)&&(position==="all"||row.position===Number(position))),[live,recent,mode,position]);
 const localFiles=useMemo(()=>files.filter(file=>!query||file.matchId.includes(query)).slice(0,localLimit),[files,query,localLimit]);
 const ids=useMemo(()=>tab==="local"?localFiles.map(file=>file.matchId):searched?[searched]:[],[tab,localFiles,searched]);
 const {metadata,remember}=useReplayMatchInfo(ids,history,live,revision);
 useEffect(()=>{
   if(!live)return;const controller=new AbortController();setHistoryLoading(true);
   const cancel=deferWork(()=>{
     const cached=cachedRead<{rows:HistoryMatch[];total?:number}>(historyPath);if(cached?.rows){setRecent(cached.rows);setTotal(cached.total??cached.rows.length);}
     if(connectionState()==="offline"){setHistoryLoading(false);return;}
     void apiRequest<{rows:HistoryMatch[];total?:number}>(historyPath,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setRecent(result.rows.filter(row=>validReplayId(row.id)));setTotal(result.total??result.rows.length);cachedWrite(historyPath,result);}}).catch(failure=>{if(!controller.signal.aborted&&errorCode(failure)!=="offline_mode")setError(failure);}).finally(()=>{if(!controller.signal.aborted)setHistoryLoading(false);});
   });return()=>{cancel();controller.abort();};
 },[live,historyPath,revision,connection]);
 useEffect(()=>{
   if(!native)return;let active=true;const cancel=deferWork(()=>{void replayNative.settings().then(value=>{if(active){setSettings(value);setConfigOpen(current=>current||!value.replayPath);}}).catch(failure=>{if(active)setError(failure);}).finally(()=>{if(active)setNativeLoading(false);});});
   return()=>{active=false;cancel();};
 },[native]);
 // Listing local DEMs can be slow. Never do it while entering the search page.
 useEffect(()=>{
   if(!native||tab!=="local")return;let active=true;setNativeLoading(true);
   const cancel=deferWork(()=>{void replayNative.files().then(value=>{if(active)setFiles(value);}).catch(failure=>{if(active)setError(failure);}).finally(()=>{if(active)setNativeLoading(false);});});
   return()=>{active=false;cancel();};
 },[native,tab,revision]);
 useEffect(()=>{const downloaded=()=>{if(mounted.current){setRevision(value=>value+1);setTab("local");}};window.addEventListener("dota-notes:replay-downloaded",downloaded);return()=>window.removeEventListener("dota-notes:replay-downloaded",downloaded);},[]);
 async function chooseFolder(){
   if(globalBusy){setNotice(fa?"پس از پایان دانلود می‌توانی پوشه را عوض کنی.":"Change the folder after current downloads finish.");return;}
   setBusy("folder");setError(null);try{const value=await replayNative.chooseFolder();if(value&&mounted.current){setSettings(value);setFiles([]);setRevision(value=>value+1);setConfigOpen(false);}}catch(failure){if(mounted.current)setError(failure);}finally{if(mounted.current)setBusy("");}
 }
 async function search(){
   if(!validReplayId(id))return;searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;setSearched(id);setError(null);
   if(!live)return;if(connectionState()==="offline"){setError({code:"offline_mode"});return;}setSearching(true);
   try{const result=await apiRequest<{match:ReplayMatchInfo}>("/api/replays/lookup",{method:"POST",body:JSON.stringify({matchId:Number(id)}),signal:controller.signal});if(!controller.signal.aborted&&result.match)remember(result.match);}catch(failure){if(!controller.signal.aborted)setError(failure);}finally{if(!controller.signal.aborted)setSearching(false);}
 }
 const download=useCallback(async(matchId:string)=>{
   if(busy)return;if(!native||!live){setNotice(t.nativeRequired);return;}if(!settings.replayPath){setNotice(t.chooseFolder);setConfigOpen(true);return;}
   if(connectionState()==="offline"){setError({code:"offline_mode"});return;}setBusy(matchId);setError(null);setNotice("");
   try{const result=await apiRequest<{match?:ReplayMatchInfo}>("/api/replays/lookup",{method:"POST",body:JSON.stringify({matchId:Number(matchId)})});if(!mounted.current)return;if(result.match)remember(result.match);await manager?.download(matchId);}
   catch(failure){if(mounted.current)setError(failure);}finally{if(mounted.current)setBusy("");}
 },[busy,native,live,settings.replayPath,manager,t]);
 const historyIds=useMemo(()=>history.slice(0,historyLimit).map(row=>row.id),[history,historyLimit]);
 const fileIds=useMemo(()=>localFiles.filter(file=>mode==="all"||metadata[file.matchId]?.mode===mode).filter(file=>position==="all"||metadata[file.matchId]?.position===Number(position)).map(file=>file.matchId),[localFiles,mode,position,metadata]);
 return <div className="screen-stack replay-workspace"><header className="workspace-header replay-header"><div className="workspace-heading"><div className="workspace-title-icon"><Film size={25}/></div><div><p className="eyebrow">{fa?"کتابخانهٔ شخصی":"YOUR REPLAY LIBRARY"}</p><h1>{t.replay}</h1></div><button className="secondary-button replay-location-toggle" aria-expanded={configOpen} onClick={()=>setConfigOpen(value=>!value)}><Settings2 size={16}/>{t.dotaFolder}<ChevronDown size={14}/></button></div><div className="history-command-bar"><PeriodControls {...{period,setPeriod,anchor,setAnchor,t}} registration={profileRegistrationDate(session)} maxDate={live?dateNow():SAMPLE_DATE}/><span className="command-divider"/><HistoryFilters {...{t,mode,setMode,position,setPosition,query,setQuery}}/></div></header>
 {!!error&&<ErrorNotice error={error} t={t}/>}{notice&&<p role="status" className="replay-notice">{notice}</p>}
 <section className={`replay-setup-card ${configOpen?"expanded":""}`}><div className="replay-setup-summary"><FolderOpen size={18}/><span>{settings.dotaPath?<bdi>{settings.dotaPath}</bdi>:t.folderHint}</span>{settings.replayPath&&<Check size={16} className="good"/>}<div className="replay-tutorial-buttons" role="group" aria-label={fa?"آموزش‌های ریپلی":"Replay tutorials"}><ReplaySetupGuide t={t}/><ReplaySetupGuide t={t} kind="playback"/></div></div>{configOpen&&<AnimatedContent className="replay-setup-detail"><p className="muted">{t.folderHint}</p><button className="primary-button replay-folder-button" disabled={!native||!!busy||globalBusy||nativeLoading} onClick={()=>void chooseFolder()}><FolderOpen size={16}/>{fa?"بازکردن پوشه":"Open folder"}</button>{settings.replayPath&&<p className="replay-path"><small>{t.replayFolder}</small><bdi>{settings.replayPath}</bdi></p>}{!native&&<small className="muted">{t.nativeRequired}</small>}</AnimatedContent>}</section>
 <TransferLane manager={manager} t={t}/>
 <section className="panel replay-library"><header className="replay-library-heading"><div className="detail-tabs" role="tablist" aria-label={t.replay}><button id="replay-find-tab" role="tab" aria-selected={tab==="find"} aria-controls="replay-panel" className={tab==="find"?"active":""} onClick={()=>setTab("find")}><Search size={16}/>{t.findReplay}</button><button id="replay-local-tab" role="tab" aria-selected={tab==="local"} aria-controls="replay-panel" className={tab==="local"?"active":""} onClick={()=>setTab("local")}><HardDrive size={16}/>{t.localReplays}{files.length>0&&<small>{files.length}</small>}</button></div>{tab==="local"&&<button className="secondary-button" disabled={!native||nativeLoading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={15}/>{t.refresh}</button>}</header>
 <div id="replay-panel" role="tabpanel" aria-labelledby={`replay-${tab}-tab`}>
 {tab==="find"?<><form className="replay-id-search" onSubmit={event=>{event.preventDefault();void search();}}><label className="search-box"><Search size={17}/><input inputMode="numeric" aria-label={t.matchId} placeholder={fa?"شناسهٔ مچ":"Search by match ID"} value={id} onChange={event=>setId(event.target.value.trim())}/></label><button className="primary-button" disabled={!validReplayId(id)||searching}>{searching?t.checking:t.replaySearch}</button></form>{searched&&<div className="replay-search-result"><LibraryRows rows={[searched]} metadata={metadata} t={t} onDownload={download} busy={!!busy||searching} queued={queued} label={t.replaySearch}/></div>}<div className="section-heading"><h2>{t.selectMatch}</h2><small>{historyLoading?t.loading:history.length}</small></div>{history.length?<LibraryRows rows={historyIds} metadata={metadata} t={t} onDownload={download} busy={!!busy} queued={queued} label={t.selectMatch}/>:<div className="library-empty"><Film size={28}/><p>{historyLoading?t.loading:t.noData}</p></div>}{(historyLimit>=30||page>1)&&total>30&&<div className="pagination"><button disabled={page<=1} onClick={()=>{setPage(value=>value-1);setHistoryLimit(10);}}>{t.previous}</button><span>{t.page} {page} / {Math.ceil(total/30)}</span><button disabled={page*30>=total} onClick={()=>{setPage(value=>value+1);setHistoryLimit(10);}}>{t.next}</button></div>}{history.length>historyLimit&&<button className="secondary-button replay-load-more" onClick={()=>setHistoryLimit(value=>value+10)}>{t.loadMore}</button>}</>:<>{files.length?<><LibraryRows rows={fileIds} files={localFiles} metadata={metadata} t={t} busy={false} label={t.localReplays}/>{files.length>localLimit&&<button className="secondary-button replay-load-more" onClick={()=>setLocalLimit(value=>value+10)}>{t.loadMore}</button>}</>:<div className="library-empty"><HardDrive size={28}/><p>{nativeLoading?t.loading:settings.replayPath?t.noReplays:t.chooseFolder}</p></div>}</>}
 </div></section></div>;
}
