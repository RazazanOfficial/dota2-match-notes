import {createContext,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore,type CSSProperties,type ReactNode} from "react";
import {Activity,Check,ChevronDown,ChevronRight,Download,Clock3,LoaderCircle,Sparkles,X,AlertCircle} from "lucide-react";
import {TaskManager,type DownloadTask,type AnalysisTask} from "../taskManager";
import {isPersian,type Messages} from "../i18n";
import {playUISound} from "../experience";
import {formatClock24} from "../time";
import {AnimatedContent} from "./AnimatedContent";
import {AnalysisProgress} from "./AnalysisProgress";
import {ErrorNotice} from "./ErrorNotice";
import {CopyValue} from "./Shared";
const Context=createContext<TaskManager|null>(null);
export const useTaskManager=()=>useContext(Context);
export function TaskProvider({owner,live,t,children}:{owner:string;live:boolean;t:Messages;children:ReactNode}){
  const manager=useMemo(()=>new TaskManager(owner,live),[owner,live]);
  useEffect(()=>{manager.start();return()=>manager.stop();},[manager]);
  return <Context.Provider value={manager}>{children}<TaskDock t={t}/></Context.Provider>;
}
const mb=(bytes:number)=>`${(bytes/1048576).toFixed(1)} MB`;
function stageLabel(task:AnalysisTask,t:Messages){
  const phase=task.progress.phase,fa=isPersian(t);
  if(task.status==="failed")return t.analysisFailed;
  if(phase==="retry_wait")return task.progress.errorCode?.match(/rate_limited|metadata_cooldown/)?(fa?"منتظر آزادشدن سهمیه":"Waiting for provider quota"):(fa?"بررسی بعدی زمان‌بندی شد":"Next check scheduled");
  return ({queued:t.analysisQueued,checking_archive:t.analysisConnect,resolving_metadata:fa?"بررسی اطلاعات ریپلی":"Checking replay information",connecting:t.analysisConnect,downloading:t.analysisDownload,validating:t.analysisDownload,awaiting_parse:fa?"منتظر موتور تحلیل":"Waiting for analysis engine",parsing:t.analysisParse,completed:t.analysisReady} as Record<string,string>)[phase]||t.checking;
}
function DownloadDetails({task,t,onDismiss}:{task:DownloadTask;t:Messages;onDismiss:()=>void}){
  const fa=isPersian(t),percent=task.totalBytes?Math.min(100,Math.round(task.bytes/task.totalBytes*100)):null;
  const eta=task.speed>0&&task.totalBytes?Math.ceil(Math.max(0,task.totalBytes-task.bytes)/task.speed):null;
  const done=task.status==="completed",failed=task.status==="failed";
  return <article className={`task-detail task-${task.status}`}><header><span className="task-kind-icon"><Download size={18}/></span><div className="task-row-title"><CopyValue value={task.matchId} t={t}/><small>{done?(fa?"روی سیستم ذخیره شد":"Saved to your PC"):failed?t.operationFailed:task.status==="preparing"?(fa?"آماده‌سازی ریپلی":"Preparing replay"):task.phase==="finalizing"?(fa?"آماده‌سازی فایل محلی":"Finalizing local file"):(fa?"درحال دانلود":"Downloading")}</small></div>{(done||failed)&&<button aria-label={t.close} onClick={onDismiss}><X size={16}/></button>}</header>
  {task.status==="transferring"&&<><progress max={100} value={percent??undefined} aria-label={t.download}/><div className="task-transfer-metrics"><bdi>{mb(task.bytes)}{task.totalBytes?` / ${mb(task.totalBytes)}`:""}</bdi><bdi>{percent==null?"…":`${percent}%`}</bdi></div><small className="task-speed"><bdi>{task.speed>0?`${mb(task.speed)}/s`:"…"}</bdi>{eta!=null&&<span>{fa?"باقی‌مانده ":"Remaining "}<bdi>{Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</bdi></span>}</small></>}
  {task.status==="preparing"&&<div className="task-waiting"><i className="signal-dot signal-retry"/><span>{task.preparation?.phase==="retry_wait"?(fa?"در انتظار بررسی بعدی سرور":"Waiting for the next server check"):(fa?"پس از آماده‌شدن، دانلود خودکار شروع می‌شود":"Download starts automatically when ready")}</span></div>}
  {failed&&<ErrorNotice code={task.errorCode} t={t}/>}</article>;
}
function TaskDock({t}:{t:Messages}){
  const manager=useTaskManager()!,state=useSyncExternalStore(manager.subscribe,manager.snapshot),[open,setOpen]=useState<"analysis"|"download"|null>(null),[expanded,setExpanded]=useState<string|null>(null),fa=isPersian(t),root=useRef<HTMLDivElement>(null);
  const active=manager.visibleAnalysis(),running=active.filter(task=>task.status!=="failed"&&task.progress.phase!=="retry_wait");
  const downloads=state.downloads.filter(task=>task.status!=="completed"),sync=state.sync&&["pending","processing"].includes(state.sync.status)?state.sync:null;
  const transferring=downloads.find(task=>task.status==="transferring"),percent=transferring?.totalBytes?Math.min(100,transferring.bytes/transferring.totalBytes*100):0;
  function close(restore=false){const button=root.current?.querySelector<HTMLButtonElement>('.task-orb[aria-expanded="true"]');setOpen(null);playUISound("close");if(restore)button?.focus();}
  function toggle(next:"analysis"|"download"){if(open===next){close();return;}setOpen(next);playUISound("open");}
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.stopPropagation();close(true);}};window.addEventListener("pointerdown",outside);window.addEventListener("keydown",escape);return()=>{window.removeEventListener("pointerdown",outside);window.removeEventListener("keydown",escape);};},[open]);
  if(!active.length&&!state.downloads.length&&!state.toast&&!sync&&!open)return null;
  return <><div ref={root} className="task-dock" aria-label={fa?"فعالیت‌های برنامه":"App activity"}>
  {!!active.length&&<button className={`task-orb ${open==="analysis"?"selected":""}`} aria-expanded={open==="analysis"} aria-controls="activity-panel" onClick={()=>toggle("analysis")}><Sparkles size={19}/><b>{running.length||<Clock3 size={13}/>}</b><span>{fa?"تحلیل مچ‌ها":"Match analysis"}</span></button>}
  {!!downloads.length&&<button className={`task-orb ${open==="download"?"selected":""}`} aria-expanded={open==="download"} aria-controls="activity-panel" style={{"--task-progress":`${percent}%`} as CSSProperties} onClick={()=>toggle("download")}><Download size={19}/><b>{downloads.filter(t=>t.status!=="failed"&&t.preparation?.phase!=="retry_wait").length||<Clock3 size={13}/>}</b><span>{fa?"دانلود ریپلی":"Replay downloads"}</span></button>}
  {sync&&<span className="task-orb task-sync" title={fa?"دریافت مچ‌ها":"Fetching matches"}><Activity size={19}/><span>{fa?"دریافت مچ‌ها":"Fetching matches"}</span></span>}
  {open&&<AnimatedContent className="task-popover panel" identity={open}><section id="activity-panel" role="dialog" aria-label={open==="analysis"?(fa?"تحلیل‌های جاری":"Active analyses"):(fa?"دانلودها":"Downloads")}><header className="activity-panel-heading"><div><p className="eyebrow">{fa?"مرکز فعالیت":"ACTIVITY CENTRE"}</p><strong>{open==="analysis"?(fa?"تحلیل مچ‌ها":"Match analysis"):(fa?"دانلود ریپلی":"Replay downloads")}</strong></div><button aria-label={t.close} onClick={()=>close(true)}><X size={18}/></button></header><div className="task-popover-list" data-native-scroll>
  {open==="analysis"?active.map(task=>{const retry=task.progress.phase==="retry_wait",failed=task.status==="failed",id=task.matchId;return <article className={`activity-row ${expanded===id?"expanded":""}`} key={id}><header><span className={`task-kind-icon ${failed?"bad":""}`}>{failed?<AlertCircle size={18}/>:<Sparkles size={18}/>}</span><div className="task-row-title"><CopyValue value={id} t={t}/><small>{stageLabel(task,t)}</small></div>{failed&&<button className="task-dismiss" aria-label={t.close} onClick={()=>manager.dismissAnalysis(task)}><X size={15}/></button>}<button className="task-expand" aria-label={`${fa?"جزئیات":"Details"} ${id}`} aria-expanded={expanded===id} onClick={()=>setExpanded(expanded===id?null:id)}><ChevronDown size={17}/></button></header>
  <div className="activity-row-meta"><i className={`signal-dot ${failed?"signal-error":retry?"signal-retry":""}`}/><small>{retry&&task.progress.nextTryAt?`${fa?"بررسی بعدی":"Next check"} ${formatClock24(task.progress.nextTryAt,t)}`:task.queueAhead!=null?`${fa?"جلوتر در صف":"Ahead in queue"}: ${task.queueAhead}`:stageLabel(task,t)}</small></div>
  {expanded===id&&<AnimatedContent className="task-expanded-detail" identity={id}><AnalysisProgress t={t} preparation={{replay:task.status,progress:task.progress}}/>{task.progress.phase==="awaiting_parse"&&task.estimatedParseSeconds!=null&&<small>{fa?"میانگین زمان پس از آغاز تحلیل: ":"Average once parsing starts: "}{task.estimatedParseSeconds}s</small>}</AnimatedContent>}</article>;}):downloads.map(task=><DownloadDetails key={task.matchId} task={task} t={t} onDismiss={()=>manager.dismiss(task.matchId)}/>)}
  {open==="analysis"&&!active.length&&<div className="task-empty"><Check size={26}/><p>{fa?"تحلیل‌های درخواستی کامل شدند.":"Your analyses have finished."}</p></div>}</div></section></AnimatedContent>}
  </div>{state.toast&&<AnimatedContent className="task-toast" identity={state.toast.id}><div role="status" onMouseEnter={()=>manager.pauseToast(true)} onMouseLeave={()=>{if(!document.querySelector('.task-toast')?.contains(document.activeElement))manager.pauseToast(false);}} onFocus={()=>manager.pauseToast(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))manager.pauseToast(false);}}><span className="task-toast-icon"><Check size={19}/></span><div><strong>{state.toast.kind==="analysis"?(fa?"تحلیل آماده شد":"Analysis complete"):state.toast.kind==="download"?(fa?"ریپلی ذخیره شد":"Replay downloaded"):(fa?"تاریخچه به‌روز شد":"Matches updated")}</strong>{state.toast.matchId&&<CopyValue value={state.toast.matchId} t={t}/>}</div><button aria-label={t.close} onClick={()=>manager.dismissToast()}><X size={16}/></button><i className="toast-countdown" key={state.toast.id}/></div></AnimatedContent>}</>;
}
