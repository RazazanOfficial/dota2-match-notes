import {API_ORIGIN,apiRequest,getBearer,getSyncStatus,type SyncJob} from "./api";
import {playUISound} from "./experience";
import {connectionState} from "./connection";
import {replayNative,validReplayId} from "./replays";
import type {ReplayProgress} from "@/lib/replay/progress";
export interface AnalysisTask {matchId:string;kind:string;status:string;requestedAt:string;progress:ReplayProgress;queueAhead:number|null;estimatedParseSeconds:number|null}
export interface DownloadTask {matchId:string;status:"preparing"|"transferring"|"completed"|"failed";bytes:number;totalBytes:number|null;speed:number;errorCode?:string;updatedAt:number;requestedAt:number;preparation?:ReplayProgress;phase?:string}
export interface TaskSnapshot {analysis:AnalysisTask[];downloads:DownloadTask[];sync:SyncJob|null;toast:{id:string;kind:"analysis"|"download"|"sync";matchId?:string}|null}
const storageKey=(owner:string)=>`dota-notes.tasks.v1.${owner}`;
export class TaskManager {
  private state:TaskSnapshot={analysis:[],downloads:[],sync:null,toast:null};
  private listeners=new Set<()=>void>();private generation=0;private alive=false;private checking=false;private transferring=false;
  private timer=0;private stopProgress?:()=>void;private baseline=false;private previous=new Map<string,string>();
  private published="";private persisted="";private toastRemaining=7000;private toastStarted=0;private toastPaused=true;
  private lastPoll=0;private syncFingerprint="";private toastTimer=0;private lastSyncId="";
  private visibility=()=>{this.pauseToast(document.visibilityState==="hidden");if(document.visibilityState!=="hidden")void this.tick(true);};
  private signal=()=>{this.published="";void this.tick(true);};
  private syncRequested=(event:Event)=>{const detail=(event as CustomEvent<SyncJob>).detail;if(detail){this.state.sync=detail;this.publish();}void this.tick(true);};
  constructor(private owner:string,private live=true,private collectSync=true){
    if(!live)return;
    try{const rows:unknown=JSON.parse(localStorage.getItem(storageKey(owner))||"[]");if(Array.isArray(rows))this.state.downloads=rows
      .filter((row):row is DownloadTask=>row&&validReplayId(row.matchId)&&Number.isFinite(row.requestedAt)).slice(-30)
      .map(row=>({...row,status:["preparing","transferring"].includes(row.status)?"preparing":row.status,bytes:0,speed:0,totalBytes:null,updatedAt:Date.now()}));}catch{}
  }
  subscribe=(callback:()=>void)=>{this.listeners.add(callback);return()=>{this.listeners.delete(callback);};};
  snapshot=()=>this.state;
  private publish(){
    const persisted=JSON.stringify(this.state.downloads.map(({matchId,status,requestedAt,errorCode})=>({matchId,status,requestedAt,...(errorCode?{errorCode}:{})})));
    if(persisted!==this.persisted){this.persisted=persisted;try{localStorage.setItem(storageKey(this.owner),persisted);}catch{}}
    const fingerprint=JSON.stringify(this.state,(key,value)=>key==="heartbeatAt"?undefined:value);
    if(fingerprint===this.published)return;this.published=fingerprint;
    this.state={...this.state,downloads:this.state.downloads.map(task=>({...task}))};this.listeners.forEach(callback=>callback());
  }
  dismissToast(){window.clearTimeout(this.toastTimer);this.state.toast=null;this.publish();}
  pauseToast(paused:boolean){
    if(!this.state.toast||this.toastPaused===paused)return;this.toastPaused=paused;window.clearTimeout(this.toastTimer);
    if(paused){this.toastRemaining=Math.max(0,this.toastRemaining-(Date.now()-this.toastStarted));return;}
    this.toastStarted=Date.now();this.toastTimer=window.setTimeout(()=>this.dismissToast(),this.toastRemaining);
  }
  private notify(kind:"analysis"|"download"|"sync",matchId?:string){
    if(!this.alive)return;this.state.toast={id:`${kind}:${matchId||""}:${Date.now()}`,kind,matchId};
    this.toastRemaining=7000;this.toastPaused=true;window.clearTimeout(this.toastTimer);this.pauseToast(document.visibilityState==="hidden");playUISound("complete");
    window.dispatchEvent(new Event("dota-notes:matches-updated"));
  }
  start(){
    if(this.alive||!this.live)return;this.alive=true;const generation=++this.generation;
    void replayNative.progress(value=>{
      if(!this.alive||generation!==this.generation)return;
      const task=this.state.downloads.find(task=>task.matchId===value.matchId&&["preparing","transferring"].includes(task.status));if(!task)return;
      const now=Date.now(),delta=now-task.updatedAt;if(delta<120&&task.phase===value.stage)return;if(delta>0&&value.bytes>=task.bytes)task.speed=Math.round((value.bytes-task.bytes)*1000/delta);
      task.phase=value.stage;task.bytes=value.bytes;task.totalBytes=value.totalBytes||null;task.status="transferring";task.updatedAt=now;this.publish();
    }).then(stop=>{if(this.alive&&generation===this.generation)this.stopProgress=stop;else stop();}).catch(()=>{});
    window.addEventListener("dota-notes:matches-updated",this.signal);window.addEventListener("dota-notes:sync-requested",this.syncRequested);window.addEventListener("focus",this.signal);
    document.addEventListener("visibilitychange",this.visibility);
    this.timer=window.setInterval(()=>void this.tick(),3000);void this.tick();
  }
  stop(){this.alive=false;this.generation++;document.removeEventListener("visibilitychange",this.visibility);this.stopProgress?.();window.clearInterval(this.timer);window.clearTimeout(this.toastTimer);
    window.removeEventListener("dota-notes:matches-updated",this.signal);window.removeEventListener("dota-notes:sync-requested",this.syncRequested);window.removeEventListener("focus",this.signal);}
  async download(matchId:string){
    if(!validReplayId(matchId))throw {code:"invalid_match_id"};if(connectionState()==="offline")throw {code:"offline_mode"};
    if(this.state.downloads.some(task=>task.matchId===matchId&&["preparing","transferring"].includes(task.status)))return;
    await apiRequest(`/api/replays/${matchId}`,{method:"POST",body:JSON.stringify({intent:"download"})});if(!this.alive)return;
    this.state.downloads=this.state.downloads.filter(task=>task.matchId!==matchId).concat({matchId,status:"preparing",bytes:0,totalBytes:null,speed:0,updatedAt:Date.now(),requestedAt:Date.now()}).slice(-30);
    this.publish();void this.tick(true);
  }
  dismiss(matchId:string){this.state.downloads=this.state.downloads.filter(task=>task.matchId!==matchId||["preparing","transferring"].includes(task.status));this.publish();}
  private async tick(force=false){
    if(!this.alive||this.checking||connectionState()==="offline"||(!force&&document.visibilityState==="hidden"))return;const generation=this.generation;
    const active=this.state.analysis.some(task=>["pending","processing"].includes(task.status)&&task.progress.phase!=="retry_wait")||this.state.downloads.some(task=>task.status==="transferring"||(task.status==="preparing"&&task.preparation?.phase!=="retry_wait"))||this.state.sync&&["pending","processing"].includes(this.state.sync.status);
    if(!force&&!active&&Date.now()-this.lastPoll<15000)return;this.lastPoll=Date.now();this.checking=true;
    try{
      const result=await apiRequest<{tasks:AnalysisTask[]}>("/api/tasks");if(!this.alive||generation!==this.generation)return;
      const rows=Array.isArray(result.tasks)?result.tasks:[];
      for(const task of rows){const key=`${task.matchId}:${task.requestedAt}`,previous=this.previous.get(key);
        if(this.baseline&&task.kind==="analysis"&&task.status==="completed"&&previous&&previous!=="completed")this.notify("analysis",task.matchId);this.previous.set(key,task.status);}
      this.baseline=true;this.state.analysis=rows.filter(task=>task.kind==="analysis");
      if(this.previous.size>256){const recent=[...this.previous.entries()].slice(-128);this.previous=new Map(recent);}
      for(const task of this.state.downloads)task.preparation=rows.find(row=>row.matchId===task.matchId)?.progress;
      const sync=this.collectSync?await getSyncStatus().catch(()=>null):null;if(!this.alive||generation!==this.generation)return;
      const job=sync?.status?.manualJob||null;
      if(job&&this.state.sync?.id===job.id&&this.state.sync.status!=="completed"&&job.status==="completed"&&this.lastSyncId!==job.id){this.lastSyncId=job.id;this.notify("sync");}
      const fingerprint=job?`${job.id}:${job.status}:${job.attempted?.length||0}:${job.result?.imported?.length||0}`:"",changed=fingerprint&&fingerprint!==this.syncFingerprint;
      this.syncFingerprint=fingerprint;this.state.sync=job;this.publish();if(changed)window.dispatchEvent(new Event("dota-notes:matches-updated"));
      if(!this.transferring)await this.transferNext();
    }catch{/* Preserve accepted tasks during connectivity failures. */}finally{this.checking=false;}
  }
  private async transferNext(){
    const generation=this.generation;
    for(const task of this.state.downloads.filter(task=>["preparing","transferring"].includes(task.status))){
      if(!this.alive||generation!==this.generation)return;if(task.status==="transferring"&&Date.now()-task.updatedAt<15000)continue;
      try{
        const status=await apiRequest<{downloadReady?:boolean;archived:boolean;status:string;errorCode?:string}>(`/api/replays/${task.matchId}`);
        if(!this.alive||generation!==this.generation)return;
        if(status.status==="failed"&&!status.downloadReady&&!status.archived){task.status="failed";task.errorCode=status.errorCode;this.publish();continue;}
        if(!status.downloadReady&&!status.archived)continue;const token=getBearer();if(!token)return;
        this.transferring=true;task.status="transferring";task.updatedAt=Date.now();this.publish();
        // Do not await native I/O: other task/status polls continue meanwhile.
        void replayNative.download(task.matchId,token,API_ORIGIN).then(()=>{
          if(!this.alive||generation!==this.generation)return;const current=this.state.downloads.find(row=>row.matchId===task.matchId&&row.requestedAt===task.requestedAt);if(!current)return;current.status="completed";current.speed=0;if(current.totalBytes)current.bytes=current.totalBytes;
          this.notify("download",task.matchId);window.dispatchEvent(new Event("dota-notes:replay-downloaded"));
        }).catch(error=>{if(!this.alive||generation!==this.generation)return;
          const current=this.state.downloads.find(row=>row.matchId===task.matchId&&row.requestedAt===task.requestedAt);if(!current)return;
          if(error?.code==="replay_busy"){current.status="preparing";current.updatedAt=Date.now();}else{current.status="failed";current.errorCode=error?.code||"replay_transfer_failed";}
        }).finally(()=>{this.transferring=false;if(this.alive)this.publish();});break;
      }catch{/* Status timeout never discards a queued transfer. */}
    }
  }
}
