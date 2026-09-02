import type { MatchBenchmarkMetric, PerformanceTone } from "../types";

const BASE_WEIGHTS: Record<string, number> = {
  gold_per_min: 1,
  xp_per_min: 0.9,
  kills_per_min: 0.86,
  deaths_per_min: 0.92,
  assists_per_min: 0.76,
  fight_participation: 0.84,
  lane_efficiency_pct: 0.9,
  last_hits_per_min: 0.82,
  denies_at_10: 0.58,
  hero_damage_per_min: 0.9,
  hero_healing_per_min: 0.34,
  tower_damage: 0.58,
  farm_quality: 0.82,
  item_timing: 0.72,
  objective_conversion: 0.82,
  vision_value: 0.78,
  detection_readiness: 0.72,
};
type ScoreDomain="laning"|"economy"|"fighting"|"survival"|"objectives"|"utility";
export interface PerformanceDomainResult{key:ScoreDomain;label:string;score:number|null;weight:number;metricCount:number}
const DOMAIN_LABEL:Record<ScoreDomain,string>={laning:"Laning",economy:"Economy",fighting:"Fighting",survival:"Survival",objectives:"Objectives",utility:"Utility"};
const METRIC_DOMAIN:Record<string,ScoreDomain>={gold_per_min:"economy",xp_per_min:"economy",last_hits_per_min:"economy",farm_quality:"economy",denies_at_10:"laning",lane_efficiency_pct:"laning",kills_per_min:"fighting",assists_per_min:"fighting",fight_participation:"fighting",hero_damage_per_min:"fighting",deaths_per_min:"survival",tower_damage:"objectives",objective_conversion:"objectives",item_timing:"objectives",hero_healing_per_min:"utility",vision_value:"utility",detection_readiness:"utility"};
const POSITION_WEIGHTS:Record<number,Record<ScoreDomain,number>>={1:{laning:20,economy:25,fighting:20,survival:15,objectives:15,utility:5},2:{laning:20,economy:20,fighting:25,survival:15,objectives:15,utility:5},3:{laning:20,economy:15,fighting:25,survival:15,objectives:20,utility:5},4:{laning:15,economy:10,fighting:25,survival:15,objectives:10,utility:25},5:{laning:15,economy:5,fighting:20,survival:15,objectives:10,utility:35}};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function performanceTone(percentile: number): PerformanceTone {
  if (percentile >= 80) return "elite";
  if (percentile >= 60) return "strong";
  if (percentile >= 40) return "steady";
  return "critical";
}

export function metricScoreWeight(metric: Pick<MatchBenchmarkMetric, "key" | "value">, durationMinutes: number) {
  const base = BASE_WEIGHTS[metric.key] ?? 0.5;
  if (metric.key === "hero_healing_per_min") {
    const totalHealing = metric.value * Math.max(1, durationMinutes);
    return base * clamp((totalHealing - 750) / 5_250, 0.05, 1);
  }
  if (metric.key === "tower_damage") {
    return base * clamp(metric.value / 5_000, 0.16, 1);
  }
  return base;
}

export function calculatePerformanceDomains(metrics:MatchBenchmarkMetric[],durationMinutes:number,position?:number|null):PerformanceDomainResult[]{
  const weights=position&&POSITION_WEIGHTS[position]?POSITION_WEIGHTS[position]:{laning:1,economy:1,fighting:1,survival:1,objectives:1,utility:1};
  return (Object.keys(DOMAIN_LABEL) as ScoreDomain[]).map((key)=>{const items=metrics.filter((metric)=>METRIC_DOMAIN[metric.key]===key).map((metric)=>({percentile:metric.qualityPercentile,weight:(metric.scoreWeight??metricScoreWeight(metric,durationMinutes))*(metric.confidence==="low"?.55:metric.confidence==="medium"?.82:1)})).filter((item)=>Number.isFinite(item.percentile)&&item.weight>0);const total=items.reduce((sum,item)=>sum+item.weight,0);return{key,label:DOMAIN_LABEL[key],score:total?Math.round(items.reduce((sum,item)=>sum+item.percentile*item.weight,0)/total):null,weight:weights[key]*clamp(total,0,1),metricCount:items.length};});
}

export function calculatePerformanceScore(metrics: MatchBenchmarkMetric[], durationMinutes: number, position?:number|null) {
  const domains=calculatePerformanceDomains(metrics,durationMinutes,position).filter((entry):entry is PerformanceDomainResult&{score:number}=>entry.score!==null&&entry.weight>0);
  const domainWeight=domains.reduce((sum,entry)=>sum+entry.weight,0);
  if(domainWeight)return Math.round(domains.reduce((sum,entry)=>sum+entry.score*entry.weight,0)/domainWeight);
  const scored = metrics.map((metric) => ({
    percentile: metric.qualityPercentile,
    weight: metric.scoreWeight ?? metricScoreWeight(metric, durationMinutes),
  })).filter((entry) => Number.isFinite(entry.percentile) && entry.weight > 0);
  const totalWeight = scored.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(scored.reduce((sum, entry) => sum + entry.percentile * entry.weight, 0) / totalWeight);
}
