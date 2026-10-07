import type { MatchItemTiming } from "../types";

interface ItemTimingReferenceSample { heroId:number;position:number|null;gameMode:number|null;itemTimings:Record<string,number>; }

type Raw=Record<string,unknown>;
const CORE_ITEMS=new Set(["battle_fury","radiance","hand_of_midas","maelstrom","mjollnir","gleipnir","orchid","bloodthorn","desolator","diffusal_blade","disperser","echo_sabre","harpoon","armlet","mask_of_madness","aghanims_scepter","black_king_bar","manta","sange_and_yasha","kaya_and_sange","yasha_and_kaya","butterfly","satanic","skadi","daedalus","monkey_king_bar","heart","assault","shivas_guard","octarine_core","refresher","scythe_of_vyse","blink","overwhelming_blink","swift_blink","arcane_blink"]);
const UTILITY_ITEMS=new Set(["force_staff","hurricane_pike","glimmer_cape","mekansm","guardian_greaves","pipe","crimson_guard","lotus_orb","solar_crest","drum_of_endurance","boots_of_bearing","vladmir","pavise","aether_lens","holy_locket","cyclone","wind_waker"]);
const DETECTION_ITEMS=new Set(["dust","ward_sentry","gem"]);
const IGNORE=new Set(["tango","flask","clarity","enchanted_mango","ward_observer","smoke_of_deceit","tp_scroll","branches","circlet","gauntlets","slippers","mantle","quelling_blade","magic_stick","magic_wand","bottle"]);
const records=(value:unknown)=>Array.isArray(value)?value.filter((entry):entry is Raw=>Boolean(entry)&&typeof entry==="object"&&!Array.isArray(entry)):[];
const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
const title=(key:string)=>key.split("_").map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join(" ");
const category=(key:string):MatchItemTiming["category"]=>DETECTION_ITEMS.has(key)?"detection":UTILITY_ITEMS.has(key)?"utility":CORE_ITEMS.has(key)?"core":"other";

export function buildItemTimings(params:{player:Raw;heroId:number;position:number|null;gameMode:number|null;samples:ItemTimingReferenceSample[]}):MatchItemTiming[]{
  const first=new Map<string,number>();
  for(const entry of records(params.player.purchase_log)){const key=String(entry.key??"").replace(/^item_/,"");const second=num(entry.time);if(!key||second===null||second<0||IGNORE.has(key))continue;if(!first.has(key)||second<first.get(key)!)first.set(key,second);}
  const relevant=[...first.entries()].filter(([key])=>CORE_ITEMS.has(key)||UTILITY_ITEMS.has(key)||DETECTION_ITEMS.has(key)).sort((left,right)=>left[1]-right[1]).slice(0,12);
  return relevant.map(([key,second])=>{
    const heroReference=params.samples.filter((sample)=>sample.heroId===params.heroId&&sample.position===params.position&&(params.gameMode===null||sample.gameMode===params.gameMode)).flatMap((sample)=>sample.itemTimings[key]===undefined?[]:[sample.itemTimings[key]]);
    const positionReference=params.samples.filter((sample)=>sample.position===params.position&&(params.gameMode===null||sample.gameMode===params.gameMode)).flatMap((sample)=>sample.itemTimings[key]===undefined?[]:[sample.itemTimings[key]]);
    const reference=heroReference.length>=3?heroReference:positionReference.length>=10?positionReference:[];
    const referenceSecond=reference.length?median(reference):null,delta=referenceSecond===null?null:Math.round((second-referenceSecond)/6)/10;
    const relative:MatchItemTiming["relativeToReference"]=delta===null?"unavailable":delta<=-2?"early":delta>=2?"late":"on_time";
    const cohort=heroReference.length>=3?`${heroReference.length} بازی Hero + Position`:`${positionReference.length} بازی Position`;
    return{key,label:title(key),minute:Math.floor(second/60),second,category:category(key),relativeToReference:relative,deltaMinutes:delta,referenceMinute:referenceSecond===null?null:Math.round(referenceSecond/6)/10,note:referenceSecond===null?"Timing ثبت شده، اما نمونه کافی برای مقایسه وجود ندارد.":`${Math.abs(delta!)} دقیقه ${delta!<0?"زودتر":"دیرتر"} از میانه ${cohort}`};
  });
}
