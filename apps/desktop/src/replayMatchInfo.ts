import {useEffect,useRef,useState} from "react";
import {apiRequest} from "./api";
import {cacheOwner,cachedRead,cachedWrite} from "./offlineCache";
import {connectionState} from "./connection";
import {deferWork} from "./experience";
import {validReplayId} from "./replays";
import type {HistoryMatch} from "./history";
import {replayInfoFromHistory,type ReplayMatchInfo} from "./components/ReplayMatchRow";
const cacheKey=(id:string)=>`replay-match-info:${id}`;
const equal=(a:ReplayMatchInfo|undefined,b:ReplayMatchInfo)=>!!a&&Object.keys(b).every(key=>a[key as keyof ReplayMatchInfo]===b[key as keyof ReplayMatchInfo]);
export function useReplayMatchInfo(ids:string[],recent:HistoryMatch[],live:boolean,revision:number){
 const key=[...new Set(ids.filter(validReplayId))].join(","),attempted=useRef(new Set<string>()),lastRevision=useRef(revision);
 const [metadata,setMetadata]=useState<Record<string,ReplayMatchInfo>>({});
 useEffect(()=>{
   const known=Object.fromEntries(recent.map(row=>[row.id,replayInfoFromHistory(row)]));
   setMetadata(previous=>Object.entries(known).some(([id,info])=>!equal(previous[id],info))?{...previous,...known}:previous);
   // One small write per idle turn. Avoid repeatedly rescanning the full offline
   // cache for every recent match while React is mounting the replay library.
   let index=0,cancel=()=>{};const owner=cacheOwner(),entries=Object.entries(known);
   const save=()=>{if(cacheOwner()!==owner)return;const item=entries[index++];if(!item)return;
     const [id,info]=item;if(!equal(cachedRead<ReplayMatchInfo>(cacheKey(id))||undefined,info))cachedWrite(cacheKey(id),info);
     if(index<entries.length)cancel=deferWork(save);
   };
   cancel=deferWork(save);return()=>cancel();
 },[recent]);
 useEffect(()=>{
   const requested=key?key.split(","):[],controller=new AbortController(),owner=cacheOwner();
   const cancel=deferWork(()=>{
     if(controller.signal.aborted)return;
     const cached=Object.fromEntries(requested.flatMap(id=>{const info=cachedRead<ReplayMatchInfo>(cacheKey(id));return info?[[id,info]]:[];}));
     setMetadata(previous=>Object.entries(cached).some(([id,info])=>!previous[id])?{...cached,...previous}:previous);
     if(!live||connectionState()==="offline")return;
     if(revision!==lastRevision.current){attempted.current.clear();lastRevision.current=revision;}
     const pending=requested.filter(id=>!attempted.current.has(id)&&(revision>0||!recent.some(row=>row.id===id)));let index=0;
     async function worker(){while(index<pending.length&&!controller.signal.aborted&&connectionState()!=="offline"){
       const id=pending[index++];try{const result=await apiRequest<{match:ReplayMatchInfo|null}>(`/api/replays/${id}`,{signal:controller.signal});
         if(!controller.signal.aborted&&cacheOwner()===owner&&result.match&&String(result.match.matchId)===id){
           cachedWrite(cacheKey(id),result.match);setMetadata(previous=>equal(previous[id],result.match!)?previous:{...previous,[id]:result.match!});
         }
       }catch{/* An imported DEM remains usable even without server metadata. */}
       finally{if(!controller.signal.aborted&&cacheOwner()===owner)attempted.current.add(id);}
     }}void Promise.all([worker(),worker()]);
   });return()=>{cancel();controller.abort();};
 },[key,recent,live,revision]);
 function remember(info:ReplayMatchInfo){const id=String(info.matchId);if(!validReplayId(id))return;cachedWrite(cacheKey(id),info);setMetadata(previous=>equal(previous[id],info)?previous:{...previous,[id]:info});}
 return {metadata,remember};
}
