import type { MatchBenchmarkMetric, MatchCohortProfile } from "../types";
import { metricScoreWeight, performanceTone } from "./performance-score";

export type CohortMetricKey =
  | "gold_per_min" | "xp_per_min" | "kills_per_min" | "deaths_per_min"
  | "assists_per_min" | "fight_participation" | "lane_efficiency_pct"
  | "last_hits_per_min" | "denies_at_10" | "hero_damage_per_min"
  | "hero_healing_per_min" | "tower_damage";

export interface HeroPositionMetaReference {
  heroId:number;position:number;rankBracket:string;gameMode:number;matchCount:number;winCount:number;
  positionShare:number;metaPickRate:number;winRate:number;positionSampleCount:number;
}
export interface BenchmarkDistributionReference {
  heroId:number;position:number;rankBracket:string;gameMode:number;patch:string;metric:string;provider:string;
  sampleCount:number|null;quantiles:Array<{percentile:number;value:number}>;
}
export interface PerformanceReferenceData {
  snapshot:{id:string;fetchedAt:string|null;expiresAt:string|null;windowDays:number;stale:boolean};
  meta:HeroPositionMetaReference[];
  benchmarks:BenchmarkDistributionReference[];
}

const DEFINITIONS:Record<string,{label:string;description:string;direction:"higher"|"lower"|"contextual";format:"number"|"decimal"|"percent"}>={
  gold_per_min:{label:"GPM",description:"میزان Gold در هر دقیقه",direction:"higher",format:"number"},
  xp_per_min:{label:"XPM",description:"میزان XP در هر دقیقه",direction:"higher",format:"number"},
  kills_per_min:{label:"Kills / min",description:"میانگین Kill در هر دقیقه",direction:"higher",format:"decimal"},
  deaths_per_min:{label:"Deaths / min",description:"میانگین Death در هر دقیقه؛ کمتر بهتر است",direction:"lower",format:"decimal"},
  assists_per_min:{label:"Assists / min",description:"میانگین Assist در هر دقیقه",direction:"higher",format:"decimal"},
  fight_participation:{label:"Fight Participation",description:"درصد مشارکت در Killهای تیم",direction:"higher",format:"percent"},
  lane_efficiency_pct:{label:"Lane Efficiency",description:"بازده اقتصادی Laning Stage",direction:"higher",format:"percent"},
  last_hits_per_min:{label:"LH / min",description:"میانگین Last Hit در هر دقیقه",direction:"higher",format:"decimal"},
  denies_at_10:{label:"Denies @10",description:"تعداد Deny تا دقیقه ۱۰",direction:"higher",format:"number"},
  hero_damage_per_min:{label:"Hero DMG / min",description:"Damage واردشده به Heroها در هر دقیقه",direction:"higher",format:"decimal"},
  hero_healing_per_min:{label:"Heal / min",description:"Heal ثبت‌شده در هر دقیقه",direction:"contextual",format:"decimal"},
  tower_damage:{label:"Tower DMG",description:"Damage واردشده به ساختمان‌ها",direction:"higher",format:"number"},
};

const RANKS:Record<number,string>={1:"HERALD",2:"GUARDIAN",3:"CRUSADER",4:"ARCHON",5:"LEGEND",6:"ANCIENT",7:"DIVINE",8:"IMMORTAL"};
const clamp=(value:number)=>Math.max(0,Math.min(100,Math.round(value)));
const format=(value:number,kind:"number"|"decimal"|"percent")=>kind==="percent"?`${value.toLocaleString("fa-IR",{maximumFractionDigits:1})}٪`:kind==="decimal"?value.toLocaleString("fa-IR",{maximumFractionDigits:2}):Math.round(value).toLocaleString("fa-IR");
const rankName=(rankTier:number|null)=>rankTier===null?null:RANKS[Math.floor(rankTier/10)]??null;
const confidence=(count:number):"high"|"medium"|"low"=>count>=500?"high":count>=100?"medium":"low";

function percentileFromCurve(value:number,points:Array<{percentile:number;value:number}>){
  const sorted=points.filter((point)=>Number.isFinite(point.percentile)&&Number.isFinite(point.value)).map((point)=>({...point,percentile:point.percentile<=1?point.percentile*100:point.percentile})).sort((a,b)=>a.value-b.value);
  if(!sorted.length)return null;
  if(value<=sorted[0].value)return clamp(sorted[0].percentile);
  if(value>=sorted.at(-1)!.value)return clamp(sorted.at(-1)!.percentile);
  for(let index=1;index<sorted.length;index+=1){const high=sorted[index],low=sorted[index-1];if(value>high.value)continue;const width=high.value-low.value;if(width<=0)return clamp(high.percentile);const ratio=(value-low.value)/width;return clamp(low.percentile+(high.percentile-low.percentile)*ratio);}
  return null;
}

function externalMetrics(params:{reference?:PerformanceReferenceData;heroId:number;durationMinutes:number;currentValues:Partial<Record<CohortMetricKey,number>>;fallbackMetrics:MatchBenchmarkMetric[]}){
  const byKey=new Map(params.fallbackMetrics.map((metric)=>[metric.key,metric]));
  if(!params.reference)return params.fallbackMetrics;
  for(const distribution of params.reference.benchmarks.filter((entry)=>entry.heroId===params.heroId&&entry.position===0&&entry.provider==="opendota")){
    if(byKey.has(distribution.metric))continue;
    const definition=DEFINITIONS[distribution.metric],value=params.currentValues[distribution.metric as CohortMetricKey];
    if(!definition||value===undefined||!Number.isFinite(value))continue;
    const raw=percentileFromCurve(value,distribution.quantiles);if(raw===null)continue;
    const quality=definition.direction==="lower"?100-raw:raw;
    byKey.set(distribution.metric,{key:distribution.metric,label:definition.label,shortLabel:definition.label,description:definition.description,direction:definition.direction,highlightEligible:true,scoreWeight:metricScoreWeight({key:distribution.metric,value},params.durationMinutes),value,formattedValue:format(value,definition.format),percentile:quality,qualityPercentile:quality,tone:performanceTone(quality),source:"hero",cohortLabel:"همان Hero · OpenDota snapshot · بدون تفکیک Position",confidence:"medium",sampleSize:distribution.sampleCount});
  }
  return [...byKey.values()];
}

export function buildCohortAnalysis(params:{reference?:PerformanceReferenceData;heroId:number;position:number|null;rankTier:number|null;patch:string|null;gameMode:number|null;durationMinutes:number;currentValues:Partial<Record<CohortMetricKey,number>>;fallbackMetrics:MatchBenchmarkMetric[]}){
  const metrics=externalMetrics(params);
  if(!params.reference||!params.position||params.gameMode===null)return{metrics,profile:undefined};
  const rank=rankName(params.rankTier);
  const candidates=params.reference.meta.filter((row)=>row.heroId===params.heroId&&row.position===params.position&&row.gameMode===params.gameMode);
  const exactRankRow=rank?candidates.find((entry)=>entry.rankBracket===rank):undefined;
  const row=exactRankRow??candidates.sort((a,b)=>b.matchCount-a.matchCount)[0];
  if(!row)return{metrics,profile:undefined};
  const limitations=["Meta براساس پنجره هفت‌روزه STRATZ است؛ فیلتر Patch دقیق هنوز در این منبع تأیید نشده است."];
  if(!rank)limitations.push("Rank بازیکن موجود نبود؛ نزدیک‌ترین cohort Mode و Position استفاده شد.");
  else if(!exactRankRow)limitations.push("برای Rank دقیق نمونه‌ای نبود؛ پرنمونه‌ترین Rank همین Hero و Position نمایش داده شد.");
  if(params.reference.snapshot.stale)limitations.push("به‌روزرسانی منبع موقتاً ناموفق بوده و آخرین Snapshot سالم نمایش داده می‌شود.");
  limitations.push("Benchmarkهای OpenDota در حال حاضر Hero-level هستند و Position را تفکیک نمی‌کنند.");
  const weight=row.matchCount/(row.matchCount+200);
  const profile:MatchCohortProfile={label:`STRATZ · Hero + Pos ${params.position} + ${row.rankBracket} + Mode · ${params.reference.snapshot.windowDays} روز`,heroPositionSamples:row.matchCount,positionSamples:row.positionSampleCount,heroPositionWeight:Math.round(weight*100),positionPickRate:Math.round(row.positionShare*10)/10,metaPickRate:Math.round(row.metaPickRate*10)/10,winRate:Math.round(row.winRate*10)/10,rankTier:params.rankTier,patch:null,gameMode:params.gameMode,confidence:confidence(row.matchCount),limitations,milestones:[],metaSource:"stratz",benchmarkSource:"opendota",snapshotFetchedAt:params.reference.snapshot.fetchedAt,stale:params.reference.snapshot.stale};
  return{metrics,profile};
}
