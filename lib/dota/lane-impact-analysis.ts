import type { DotaTeam, MatchAnalysisEvent, MatchLaneImpact, MatchMinuteSnapshot } from "../types";

type Raw=Record<string,unknown>;

const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
const record=(value:unknown):Raw|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Raw:null;
const records=(value:unknown)=>Array.isArray(value)?value.map(record).filter((entry):entry is Raw=>Boolean(entry)):[];
const eventSecond=(entry:Raw)=>num(entry.time)??num(entry.timestamp)??0;
const key=(entry:Raw)=>typeof entry.key==="string"?entry.key.replace(/^item_/,""):"";
const valueAt10=(values:unknown)=>Array.isArray(values)?num(values[Math.min(10,values.length-1)]):null;
const teamOf=(player:Raw):DotaTeam|null=>{const slot=num(player.player_slot);return slot===null?null:slot<128?"radiant":"dire";};
const roleGroup=(position:number|null):MatchLaneImpact["roleGroup"]=>position&&position<=3?"core":position?"support":"unknown";
const counterpartPosition=(position:number|null)=>position===1?3:position===3?1:position===4?5:position===5?4:position===2?2:null;
const laneResourceKeys=new Set(["tango","flask","clarity","enchanted_mango","faerie_fire"]);

function purchasesBefore(player:Raw,seconds:number,predicate:(itemKey:string)=>boolean){
  return records(player.purchase_log).filter((entry)=>eventSecond(entry)<=seconds&&predicate(key(entry))).length;
}

function placementsBefore(player:Raw,field:"obs_log"|"sen_log",seconds:number){
  return records(player[field]).filter((entry)=>eventSecond(entry)<=seconds).length;
}

function closest(timeline:MatchMinuteSnapshot[],minute:number){
  return [...timeline].reverse().find((entry)=>entry.minute<=minute);
}

function laneEfficiency(player:Raw){
  const percentage=num(player.lane_efficiency_pct),ratio=num(player.lane_efficiency);
  return percentage??(ratio===null?null:Math.round(ratio*100));
}

export function buildLaneImpact(params:{player:Raw;playerPosition:number|null;players:Raw[];positions:Map<number,number|null>;timeline:MatchMinuteSnapshot[];timelines?:Map<number,MatchMinuteSnapshot[]>;events:MatchAnalysisEvent[]}):MatchLaneImpact{
  const slot=num(params.player.player_slot),team=teamOf(params.player),targetPosition=counterpartPosition(params.playerPosition);
  const opponent=targetPosition===null||team===null?null:params.players.find((candidate)=>{
    const candidateSlot=num(candidate.player_slot);
    return candidateSlot!==null&&teamOf(candidate)!==team&&params.positions.get(candidateSlot)===targetPosition;
  })??null;
  const opponentSlot=opponent?num(opponent.player_slot):null;
  const point=closest(params.timeline,10);
  const opponentPoint=opponentSlot===null?undefined:closest(params.timelines?.get(opponentSlot)??[],10);
  const opponentLastHits=opponent?valueAt10(opponent.lh_t):null;
  const opponentXp=opponent?valueAt10(opponent.xp_t):null;
  const opponentGold=opponentPoint?.gold??(opponent?valueAt10(opponent.gold_t):null);
  const lastHits=valueAt10(params.player.lh_t)??point?.lastHits??null;
  const denies=valueAt10(params.player.dn_t)??point?.denies??null;
  const xp=valueAt10(params.player.xp_t)??point?.xp??null;
  const netWorth=point?.gold??valueAt10(params.player.gold_t);
  const killEvents=params.events.filter((entry)=>entry.type==="kill"&&entry.second<=600),deathEvents=params.events.filter((entry)=>entry.type==="death"&&entry.second<=600);
  const kills=Array.isArray(params.player.kills_log)||killEvents.length?killEvents.length:num(params.player.kills)===0?0:null;
  const deaths=Array.isArray(params.player.deaths_log)||deathEvents.length?deathEvents.length:num(params.player.deaths)===0?0:null;
  const resources=purchasesBefore(params.player,600,(item)=>laneResourceKeys.has(item));
  const observers=placementsBefore(params.player,"obs_log",600);
  const sentries=placementsBefore(params.player,"sen_log",600);
  const delta=(left:number|null,right:number|null)=>left===null||right===null?null:left-right;
  const netWorthDelta=delta(netWorth,opponentGold),xpDelta=delta(xp,opponentXp),lastHitDelta=delta(lastHits,opponentLastHits);
  const group=roleGroup(params.playerPosition);
  const evidence:string[]=[];
  if(group==="core"){
    if(netWorthDelta!==null)evidence.push(`اختلاف Net Worth دقیقه ۱۰ با Core روبه‌رو: ${netWorthDelta>=0?"+":""}${Math.round(netWorthDelta)}`);
    if(xpDelta!==null)evidence.push(`اختلاف XP دقیقه ۱۰: ${xpDelta>=0?"+":""}${Math.round(xpDelta)}`);
    if(lastHitDelta!==null)evidence.push(`اختلاف LH دقیقه ۱۰: ${lastHitDelta>=0?"+":""}${Math.round(lastHitDelta)}`);
  }else if(group==="support"){
    evidence.push(`${resources} خرید Resource، ${observers} Observer و ${sentries} Sentry تا دقیقه ۱۰`);
    if(xpDelta!==null)evidence.push(`اختلاف XP دقیقه ۱۰ با Support روبه‌رو: ${xpDelta>=0?"+":""}${Math.round(xpDelta)}`);
  }
  evidence.push(`${kills===null?"نامشخص":kills} Kill و ${deaths===null?"نامشخص":deaths} Death تا دقیقه ۱۰`);
  const normalized=(value:number|null,scale:number)=>value===null?null:Math.max(-1,Math.min(1,value/scale));
  const survivalSignal=deaths===null?null:deaths?-Math.min(1,deaths/3):.2;
  const signals=group==="core"?[normalized(netWorthDelta,900),normalized(xpDelta,900),normalized(lastHitDelta,12),survivalSignal]:group==="support"?[normalized(xpDelta,750),Math.min(1,(resources+observers+sentries)/5),kills===null?null:kills?.35:0,survivalSignal]:[];
  const known=signals.filter((value):value is number=>value!==null);
  const result=known.length?known.reduce((sum,value)=>sum+value,0)/known.length:null;
  const assessment=result===null?"unknown":result>.18?"ahead":result<-.18?"behind":"even";
  const available=[lastHits,denies,xp,netWorth,laneEfficiency(params.player)].filter((value)=>value!==null).length;
  const confidence:MatchLaneImpact["confidence"]=opponent&&available>=4&&params.events.length?"high":opponent&&available>=2?"medium":"low";
  return{availability:available?opponent?"ready":"partial":"unavailable",roleGroup:group,laneRole:num(params.player.lane_role),opponentPlayerSlot:opponentSlot,lastHitsAt10:lastHits,deniesAt10:denies,netWorthAt10:netWorth,xpAt10:xp,killsAt10:kills,deathsAt10:deaths,laneEfficiency:laneEfficiency(params.player),resourcePurchasesAt10:resources,observerPlacementsAt10:observers,sentryPlacementsAt10:sentries,netWorthDelta,xpDelta,lastHitDelta,assessment,confidence,evidence,note:group==="support"?"Support با XP، مرگ، مشارکت و منابع Lane بررسی می‌شود؛ LH و Net Worth پایین به‌تنهایی جریمه نیست.":"Core با اقتصاد، XP، LH/Deny و بقا در ده دقیقه اول بررسی می‌شود. این نتیجه Context همان Lane است و وارد Score جهانی نمی‌شود."};
}
