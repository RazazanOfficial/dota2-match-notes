import type { MatchPositionEvidence, MatchPositionResolution } from "../types";

type Raw=Record<string,unknown>;
const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
const rec=(value:unknown):Raw|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Raw:null;
const list=(value:unknown)=>Array.isArray(value)?value.map(rec).filter((entry):entry is Raw=>Boolean(entry)):[];
const timelineAt=(value:unknown,minute:number)=>Array.isArray(value)?num(value[Math.min(minute,value.length-1)]):null;
const purchaseCount=(player:Raw,key:string)=>num(player[`purchase_${key}`])??num(rec(player.purchase)?.[key])??0;

interface PositionCandidate { slot:number; scores:Record<number,number>; evidence:MatchPositionEvidence[]; source:MatchPositionResolution["source"]; preferred:number|null; }

function evidence(player:Raw,stratzPosition:number|null,manualPosition:number|null):PositionCandidate|null{
  const slot=num(player.player_slot);if(slot===null)return null;
  const items:MatchPositionEvidence[]=[];const scores:Record<number,number>={1:0,2:0,3:0,4:0,5:0};
  const add=(key:string,label:string,weight:number,supports:number[])=>{items.push({key,label,weight,supports});supports.forEach((position)=>scores[position]+=weight);};
  if(manualPosition){add("manual","Position توسط کاربر تأیید شده",100,[manualPosition]);return{slot,scores,evidence:items,source:"manual",preferred:manualPosition};}
  if(stratzPosition){add("stratz","Position از STRATZ",92,[stratzPosition]);return{slot,scores,evidence:items,source:"stratz",preferred:stratzPosition};}
  const openPosition=num(player.position_est);if(openPosition&&openPosition>=1&&openPosition<=5)add("opendota-position","Position تخمینی OpenDota",58,[Math.round(openPosition)]);
  const laneRole=num(player.lane_role);if(laneRole===1)add("safe-lane","Safe Lane در Laning Stage",22,[1,5]);if(laneRole===2)add("mid-lane","Mid Lane در Laning Stage",32,[2]);if(laneRole===3)add("off-lane","Off Lane در Laning Stage",22,[3,4]);
  if(player.is_roaming===true)add("roaming","Roaming ثبت‌شده",18,[4]);
  const lh10=timelineAt(player.lh_t,10)??0,gpm=num(player.gold_per_min)??0,wards=(num(player.obs_placed)??purchaseCount(player,"ward_observer"))+(num(player.sen_placed)??purchaseCount(player,"ward_sentry"));
  if(lh10>=55)add("farm-high","LH@10 بالا",22,[1,2]);else if(lh10>=35)add("farm-core","LH@10 متناسب Core",14,[1,2,3]);else if(lh10<=20)add("farm-support","LH@10 پایین",17,[4,5]);
  if(gpm>=550)add("economy-high","GPM بالا",12,[1,2]);else if(gpm<=380)add("economy-support","GPM پایین",10,[4,5]);
  if(wards>=4)add("vision-heavy","مشارکت زیاد در Vision",14,[4,5]);else if(wards>=1)add("vision","خرید ابزار Vision",6,[3,4,5]);
  const preferred=Object.entries(scores).sort((left,right)=>right[1]-left[1])[0];
  return{slot,scores,evidence:items,source:openPosition?"opendota":"heuristic",preferred:preferred&&preferred[1]>0?Number(preferred[0]):null};
}

function permutations(values:number[]):number[][]{if(values.length<2)return[values];return values.flatMap((value,index)=>permutations([...values.slice(0,index),...values.slice(index+1)]).map((tail)=>[value,...tail]));}

function resolveTeam(candidates:PositionCandidate[]){
  if(!candidates.length)return new Map<number,{position:number|null;candidate:PositionCandidate;confidence:number}>();
  const resolved=new Map<number,{position:number|null;candidate:PositionCandidate;confidence:number}>(),fixed=candidates.filter((candidate)=>candidate.source==="manual"||candidate.source==="stratz"),open=candidates.filter((candidate)=>!fixed.includes(candidate));
  fixed.forEach((candidate)=>resolved.set(candidate.slot,{position:candidate.preferred,candidate,confidence:candidate.source==="manual"?100:92}));
  const used=new Set(fixed.flatMap((candidate)=>candidate.preferred?[candidate.preferred]:[])),available=[1,2,3,4,5].filter((position)=>!used.has(position));
  const pool=available.length>=open.length?available:[1,2,3,4,5],possible=permutations(pool).filter((entry)=>entry.length>=open.length).map((entry)=>entry.slice(0,open.length));let best=possible[0]??[],bestScore=-Infinity;
  for(const assignment of possible){const score=assignment.reduce((sum,position,index)=>sum+(open[index].scores[position]??0),0);if(score>bestScore){bestScore=score;best=assignment;}}
  open.forEach((candidate,index)=>{const position=best[index]??candidate.preferred,sorted=Object.values(candidate.scores).sort((a,b)=>b-a),margin=position===null?0:Math.max(0,(candidate.scores[position]??0)-(sorted[1]??0)),base=candidate.source==="opendota"?68:48;resolved.set(candidate.slot,{position,candidate,confidence:Math.min(86,Math.round(base+Math.min(18,margin/2)))});});
  return resolved;
}

export function resolveMatchPositions(params:{players:Raw[];stratzRawData?:unknown;positionOverrides?:Record<string,number>|null;profileSlot:number|null;profileAssignedPosition:number|null}){
  const stratz=rec(params.stratzRawData),stratzPositions=new Map<number,number>();
  for(const player of list(stratz?.players)){const slot=num(player.playerSlot),match=/^POSITION_([1-5])$/.exec(String(player.position??""));if(slot!==null&&match)stratzPositions.set(slot,Number(match[1]));}
  const candidates=params.players.flatMap((player)=>{const slot=num(player.player_slot);if(slot===null)return[];const candidate=evidence(player,stratzPositions.get(slot)??null,params.positionOverrides?.[String(slot)]??null);return candidate?[candidate]:[];});
  const results=new Map<number,MatchPositionResolution>();
  for(const team of [candidates.filter((item)=>item.slot<128),candidates.filter((item)=>item.slot>=128)]){
    for(const [slot,item] of resolveTeam(team))results.set(slot,{assignedPosition:null,detectedPosition:item.position,confirmedPosition:item.candidate.source==="manual"||item.candidate.source==="stratz"?item.position:null,confidence:item.confidence,source:item.candidate.source,roleSwapDetected:false,swapWithPlayerSlot:null,evidence:item.candidate.evidence});
  }
  const profile=params.profileSlot===null?null:results.get(params.profileSlot);
  if(profile&&params.profileAssignedPosition){profile.assignedPosition=params.profileAssignedPosition;profile.roleSwapDetected=profile.detectedPosition!==null&&profile.detectedPosition!==params.profileAssignedPosition;if(profile.roleSwapDetected){const sameTeam=[...results.entries()].filter(([slot])=>(slot<128)===(params.profileSlot!<128));const partner=sameTeam.find(([slot,value])=>slot!==params.profileSlot&&value.detectedPosition===params.profileAssignedPosition);if(partner&&profile.detectedPosition){profile.swapWithPlayerSlot=partner[0];partner[1].assignedPosition=profile.detectedPosition;partner[1].roleSwapDetected=true;partner[1].swapWithPlayerSlot=params.profileSlot;}}}
  return results;
}
