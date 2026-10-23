import {API_ORIGIN,apiRequest,getBearer,getSyncStatus,type SyncJob} from "./api";
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
  private lastPoll=0;private syncFingerprint="";private toastTimer=0;private lastSyncId="";
  private signal=()=>{void this.tick(true);};
  private syncRequested=(event:Event)=>{const detail=(event as CustomEvent<SyncJob>).detail;if(detail){this.state.sync=detail;this.publish();}void this.tick(true);};
  constructor(private owner:string,private live=true){
    if(!live)return;
    try{const rows:unknown=JSON.parse(localStorage.getItem(storageKey(owner))||"[]");if(Array.isArray(rows))this.state.downloads=rows
      .filter((row):row is DownloadTask=>row&&validReplayId(row.matchId)&&Number.isFinite(row.requestedAt)).slice(-30)
      .map(row=>({...row,status:["preparing","transferring"].includes(row.status)?"preparing":row.status,bytes:0,speed:0,totalBytes:null}));}catch{}
  }
  subscribe=(callback:()=>void)=>{this.listeners.add(callback);return()=>{this.listeners.delete(callback);};};
  snapshot=()=>this.state;
  private publish(){this.state={...this.state};try{localStorage.setItem(storageKey(this.owner),JSON.stringify(this.state.downloads));}catch{}this.listeners.forEach(callback=>callback());}
  private notify(kind:"analysis"|"download"|"sync",matchId?:string){
    if(!this.alive)return;this.state.toast={id:`${kind}:${matchId||""}:${Date.now()}`,kind,matchId};
    window.clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>{this.state.toast=null;this.publish();},7000);
    window.dispatchEvent(new Event("dota-notes:matches-updated"));
  }
  start(){
    if(this.alive||!this.live)return;this.alive=true;const generation=++this.generation;
    void replayNative.progress(value=>{
      if(!this.alive||generation!==this.generation)return;
      const task=this.state.downloads.find(task=>task.matchId===value.matchId&&["preparing","transferring"].includes(task.status));if(!task)return;
      const now=Date.now(),delta=now-task.updatedAt;if(delta>0&&value.bytes>=task.bytes)task.speed=Math.round((value.bytes-task.bytes)*1000/delta);
      task.phase=value.stage;task.bytes=value.bytes;task.totalBytes=value.totalBytes||null;task.status="transferring";task.updatedAt=now;this.publish();
    }).then(stop=>{if(this.alive&&generation===this.generation)this.stopProgress=stop;else stop();}).catch(()=>{});
    window.addEventListener("dota-notes:matches-updated",this.signal);window.addEventListener("dota-notes:sync-requested",this.syncRequested);window.addEventListener("focus",this.signal);
    this.timer=window.setInterval(()=>void this.tick(),3000);void this.tick();
  }
  stop(){this.alive=false;this.generation++;this.stopProgress?.();window.clearInterval(this.timer);window.clearTimeout(this.toastTimer);
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
    if(!this.alive||this.checking||connectionState()==="offline")return;const generation=this.generation;
    const active=this.state.analysis.some(task=>["pending","processing"].includes(task.status))||this.state.downloads.some(task=>["preparing","transferring"].includes(task.status))||this.state.sync&&["pending","processing"].includes(this.state.sync.status);
    if(!force&&!active&&Date.now()-this.lastPoll<15000)return;this.lastPoll=Date.now();this.checking=true;
    try{
      const result=await apiRequest<{tasks:AnalysisTask[]}>("/api/tasks");if(!this.alive||generation!==this.generation)return;
      const rows=Array.isArray(result.tasks)?result.tasks:[];
      for(const task of rows){const key=`${task.matchId}:${task.requestedAt}`,previous=this.previous.get(key);
        if(this.baseline&&task.kind==="analysis"&&task.status==="completed"&&previous&&previous!=="completed")this.notify("analysis",task.matchId);this.previous.set(key,task.status);}
      this.baseline=true;this.state.analysis=rows.filter(task=>task.kind==="analysis");
      for(const task of this.state.downloads)task.preparation=rows.find(row=>row.matchId===task.matchId)?.progress;
      const sync=await getSyncStatus().catch(()=>null);if(!this.alive||generation!==this.generation)return;
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
          if(!this.alive||generation!==this.generation)return;task.status="completed";task.speed=0;if(task.totalBytes)task.bytes=task.totalBytes;
          this.notify("download",task.matchId);window.dispatchEvent(new Event("dota-notes:replay-downloaded"));
        }).catch(error=>{if(!this.alive||generation!==this.generation)return;
          if(error?.code==="replay_busy"){task.status="preparing";task.updatedAt=Date.now();}else{task.status="failed";task.errorCode=error?.code||"replay_transfer_failed";}
        }).finally(()=>{this.transferring=false;if(this.alive)this.publish();});break;
      }catch{/* Status timeout never discards a queued transfer. */}
    }
  }
}
