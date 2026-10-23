import {createContext,useContext,useEffect,useMemo,useState,useSyncExternalStore,type CSSProperties,type ReactNode} from "react";
import {Activity,Check,ChevronDown,Download,Sparkles,X} from "lucide-react";
import {TaskManager,type DownloadTask} from "../taskManager";
import {isPersian,type Messages} from "../i18n";
import {AnalysisProgress} from "./AnalysisProgress";
import {ErrorNotice} from "./ErrorNotice";
import {CopyValue} from "./Shared";
const Context=createContext<TaskManager|null>(null);
export const useTaskManager=()=>useContext(Context);
export function TaskProvider({owner,live,t,children}:{owner:string;live:boolean;t:Messages;children:ReactNode}){
 const manager=useMemo(()=>new TaskManager(owner,live),[owner,live]);useEffect(()=>{manager.start();return()=>manager.stop();},[manager]);
 return <Context.Provider value={manager}>{children}<TaskDock t={t}/></Context.Provider>;
}
const mb=(bytes:number)=>`${(bytes/1048576).toFixed(1)} MB`;
function DownloadDetails({task,t,onDismiss}:{task:DownloadTask;t:Messages;onDismiss:()=>void}){
 const fa=isPersian(t),percent=task.totalBytes?Math.min(100,Math.round(task.bytes/task.totalBytes*100)):null;
 const eta=task.phase!=="finalizing"&&task.speed>0&&task.totalBytes?Math.ceil(Math.max(0,task.totalBytes-task.bytes)/task.speed):null;
 return <article className={`task-detail task-${task.status}`}><header><CopyValue value={task.matchId} t={t}/><span>{task.status==="completed"?<><Check size={14}/>{fa?"دانلود شد":"Downloaded"}</>:task.status==="preparing"?(fa?"آماده‌سازی فایل":"Preparing file"):task.status==="failed"?(fa?"دانلود کامل نشد":"Download failed"):task.phase==="finalizing"?(fa?"آماده‌سازی فایل روی سیستم":"Finalizing local file"):(fa?"دریافت روی سیستم":"Downloading to your PC")}</span>{["completed","failed"].includes(task.status)&&<button aria-label={t.close} onClick={onDismiss}><X size={14}/></button>}</header>
 {task.status==="transferring"&&<><progress max={100} value={percent??undefined} aria-label={t.download}/><div className="task-transfer-metrics"><bdi>{mb(task.bytes)}{task.totalBytes?` / ${mb(task.totalBytes)}`:""}</bdi><bdi>{percent==null?"…":`${percent}%`}</bdi></div><small><bdi>{task.speed>0?`${mb(task.speed)}/s`:"…"}</bdi>{eta!=null&&<span>{fa?"زمان باقی‌ماندهٔ تقریبی: ":"About "}<bdi>{Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</bdi></span>}</small></>}
 {task.status==="preparing"&&<><div className="task-indeterminate"><i/></div>{task.preparation&&<small>{task.preparation.phase==="completed"?(fa?"فایل آماده است؛ منتظر نوبت دانلود روی سیستم":"File ready; waiting for a local transfer slot"):task.preparation.phase==="downloading"?(fa?"دریافت از سرور بازی":"Receiving from the game server"):task.preparation.phase==="retry_wait"?(fa?"منتظر تلاش مجدد سرور":"Waiting for the server retry"):(fa?"در صف آماده‌سازی سرور":"Queued for server preparation")}{task.preparation.phase==="downloading"&&<bdi>{mb(task.preparation.bytes)}{task.preparation.totalBytes?` / ${mb(task.preparation.totalBytes)}`:""}</bdi>}</small>}</>}
 {task.status==="failed"&&<ErrorNotice code={task.errorCode} t={t}/>}</article>;
}
function TaskDock({t}:{t:Messages}){
 const manager=useTaskManager()!,state=useSyncExternalStore(manager.subscribe,manager.snapshot),[open,setOpen]=useState<"analysis"|"download"|null>(null),fa=isPersian(t);
 const active=state.analysis.filter(task=>["pending","processing"].includes(task.status)),downloads=state.downloads.filter(task=>task.status!=="completed");
 const sync=state.sync&&["pending","processing"].includes(state.sync.status)?state.sync:null,transferring=downloads.find(task=>task.status==="transferring");
 const percent=transferring?.totalBytes?Math.min(100,transferring.bytes/transferring.totalBytes*100):0;
 if(!active.length&&!state.downloads.length&&!state.toast&&!sync&&!open)return null;
 return <><div className="task-dock" aria-label={fa?"فعالیت‌های برنامه":"App activity"}>
 {!!active.length&&<button className={`task-orb ${open==="analysis"?"selected":""}`} aria-expanded={open==="analysis"} onClick={()=>setOpen(open==="analysis"?null:"analysis")}><Sparkles size={20}/><b>{active.length}</b><span>{fa?"تحلیل مچ‌ها":"Match analysis"}</span></button>}
 {!!state.downloads.length&&<button className={`task-orb ${open==="download"?"selected":""}`} style={{"--task-progress":`${percent}%`} as CSSProperties} aria-expanded={open==="download"} onClick={()=>setOpen(open==="download"?null:"download")}><Download size={20}/><b>{downloads.length||<Check size={12}/>}</b><span>{fa?"دانلود ریپلی":"Replay downloads"}</span></button>}
 {sync&&<span className="task-orb task-sync" title={fa?"دریافت مچ‌ها":"Fetching matches"}><Activity size={19}/><span>{fa?"دریافت مچ‌ها":"Fetching matches"}</span></span>}
 {open&&<section className="task-popover panel" aria-label={open==="analysis"?(fa?"تحلیل‌های جاری":"Active analyses"):(fa?"دانلودها":"Downloads")}><header><strong>{open==="analysis"?(fa?"تحلیل‌های جاری":"Active analyses"):(fa?"دانلودها":"Downloads")}</strong><button aria-label={t.close} onClick={()=>setOpen(null)}><ChevronDown size={20}/></button></header><div className="task-popover-list">{open==="analysis"?active.map(task=><article className="task-detail" key={task.matchId}><header><CopyValue value={task.matchId} t={t}/>{task.queueAhead!=null&&<small>{fa?"تقریباً جلوتر در صف: ":"Approximately ahead: "}{task.queueAhead}</small>}</header><AnalysisProgress t={t} preparation={{replay:task.status,progress:task.progress}}/>{task.progress.phase==="awaiting_parse"&&task.estimatedParseSeconds!=null&&<small>{fa?"میانگین زمان تحلیل پس از شروع: ":"Average parse time once started: "}{task.estimatedParseSeconds}s</small>}</article>):state.downloads.map(task=><DownloadDetails key={task.matchId} task={task} t={t} onDismiss={()=>manager.dismiss(task.matchId)}/>)}{open==="analysis"&&!active.length&&<p>{fa?"تحلیل‌های درخواستی کامل شدند.":"Your analyses have finished."}</p>}</div></section>}
 </div>{state.toast&&<div className="task-toast" role="status" key={state.toast.id}><Check size={19}/><span>{state.toast.kind==="analysis"?(fa?"تحلیل مچ آماده شد":"Match analysis is ready"):state.toast.kind==="download"?(fa?"ریپلی روی سیستم ذخیره شد":"Replay saved to your PC"):(fa?"دریافت مچ‌ها کامل شد":"Match fetch completed")}</span>{state.toast.matchId&&<CopyValue value={state.toast.matchId} t={t}/>}</div>}</>;
}
