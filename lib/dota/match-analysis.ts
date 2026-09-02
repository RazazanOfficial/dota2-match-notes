import { heroById } from "../../data/heroes";
import type { DotaTeam, MatchAnalysis, MatchAnalysisEvent, MatchBenchmarkMetric, MatchMapAnalysis, MatchMapPoint, MatchMinuteSnapshot, MatchPlayerAnalysis, MatchRole, TimelineState } from "../types";
import { openDotaMatchSchema } from "../opendota/validation";
import type { StratzMatch } from "../stratz/validation";
import { calculatePerformanceScore, metricScoreWeight, performanceTone } from "./performance-score";
import { buildPlayerMapAnalysis, playerEvents } from "./match-map-analysis";
import { buildCohortAnalysis, type CohortMetricKey, type PerformanceReferenceData } from "./performance-cohort";
import { resolveMatchPositions } from "./position-resolver";
import { buildItemTimings } from "./item-timing-analysis";

type UnknownRecord = Record<string, unknown>;

const METRICS = [
  { key: "gold_per_min", label: "GPM", description: "میزان Gold به‌دست‌آمده در هر دقیقه", direction: "higher", field: "gold_per_min", unit: "number" },
  { key: "xp_per_min", label: "XPM", description: "میزان XP به‌دست‌آمده در هر دقیقه", direction: "higher", field: "xp_per_min", unit: "number" },
  { key: "kills_per_min", label: "Kills / min", description: "میانگین Kill در هر دقیقه", direction: "higher", field: "kills", unit: "perMinute" },
  { key: "deaths_per_min", label: "Deaths / min", description: "میانگین Death در هر دقیقه؛ مقدار کمتر بهتر است", direction: "lower", field: "deaths", unit: "perMinute" },
  { key: "assists_per_min", label: "Assists / min", description: "میانگین Assist در هر دقیقه", direction: "higher", field: "assists", unit: "perMinute" },
  { key: "fight_participation", label: "Fight Participation", description: "درصد مشارکت در Killهای تیم", direction: "higher", field: "fight_participation", unit: "percent" },
  { key: "lane_efficiency_pct", label: "Lane Efficiency", description: "بازده اقتصادی Laning Stage", direction: "higher", field: "lane_efficiency_pct", unit: "percent" },
  { key: "last_hits_per_min", label: "LH / min", description: "میانگین Last Hit در هر دقیقه", direction: "higher", field: "last_hits", unit: "perMinute" },
  { key: "denies_at_10", label: "Denies @10", description: "تعداد Deny تا پایان دقیقه ۱۰", direction: "higher", field: "dn_t", unit: "at10" },
  { key: "hero_damage_per_min", label: "Hero DMG / min", description: "میانگین Damage واردشده به Heroها در هر دقیقه", direction: "higher", field: "hero_damage", unit: "perMinute" },
  { key: "hero_healing_per_min", label: "Heal / min", description: "میانگین Heal ثبت‌شده در هر دقیقه", direction: "contextual", field: "hero_healing", unit: "perMinute" },
  { key: "tower_damage", label: "Tower DMG", description: "مجموع Damage واردشده به Tower و ساختمان‌ها", direction: "higher", field: "tower_damage", unit: "number" },
] as const;

const POSITION_LABELS: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Support", 5: "Hard Support" };

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}
function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function numberArray(value: unknown): Array<number | null> {
  return Array.isArray(value) ? value.map(numeric) : [];
}
function clampPercent(value: number) { return Math.max(0, Math.min(100, Math.round(value * 100))); }
function metricValue(player: UnknownRecord, field: string, durationMinutes: number, unit: string) {
  if(unit==="at10"){const values=numberArray(player[field]);return values[Math.min(10,values.length-1)]??null;}
  const raw = numeric(player[field]);
  if (raw === null) return null;
  return unit === "perMinute" ? raw / Math.max(1, durationMinutes) : raw;
}
function formatMetric(value: number, unit: string) {
  if (unit === "percent") return `${value.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`;
  if (unit === "perMinute") return value.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
  return Math.round(value).toLocaleString("fa-IR");
}

function highlightEligible(key: string, value: number, durationMinutes: number) {
  if (key !== "hero_healing_per_min") return true;
  return value * durationMinutes > 1_500;
}

function scoreMetric(key:string,label:string,value:number|null,qualityPercentile:number|null,description:string,confidence:"high"|"medium"|"low"="medium",highlightEligible=false):MatchBenchmarkMetric|null{
  if(value===null||qualityPercentile===null||!Number.isFinite(value)||!Number.isFinite(qualityPercentile))return null;
  const quality=Math.max(0,Math.min(100,Math.round(qualityPercentile)));
  return{key,label,description,direction:"higher",highlightEligible,scoreOnly:true,value,formattedValue:Math.round(value).toLocaleString("fa-IR"),percentile:quality,qualityPercentile:quality,tone:performanceTone(quality),source:"match",cohortLabel:"Context همین Match",confidence};
}

function embeddedBenchmarks(player: UnknownRecord, durationMinutes: number) {
  const source = record(player.benchmarks);
  if (!source) return [];
  return METRICS.flatMap((definition): MatchBenchmarkMetric[] => {
    const benchmark = record(source[definition.key]);
    const rawPercentile = numeric(benchmark?.pct);
    const rawValue = numeric(benchmark?.raw) ?? metricValue(player, definition.field, durationMinutes, definition.unit);
    if (rawPercentile === null || rawValue === null) return [];
    const percentile = clampPercent(rawPercentile);
    const qualityPercentile = percentile;
    return [{ key: definition.key, label: definition.label, shortLabel: definition.label, description: definition.description, direction: definition.direction, highlightEligible: highlightEligible(definition.key, rawValue, durationMinutes), scoreWeight: metricScoreWeight({ key: definition.key, value: rawValue }, durationMinutes), value: rawValue, formattedValue: formatMetric(rawValue, definition.unit), percentile, qualityPercentile, tone: performanceTone(qualityPercentile), source: "hero",cohortLabel:"همان Hero · OpenDota",confidence:"medium" }];
  });
}

function matchBenchmarks(players: UnknownRecord[], player: UnknownRecord, durationMinutes: number) {
  return METRICS.flatMap((definition): MatchBenchmarkMetric[] => {
    const value = metricValue(player, definition.field, durationMinutes, definition.unit);
    if (value === null) return [];
    const values = players.map((candidate) => metricValue(candidate, definition.field, durationMinutes, definition.unit)).filter((candidate): candidate is number => candidate !== null).sort((a, b) => a - b);
    if (values.length < 5) return [];
    const qualityPercentile = Math.round((values.filter((candidate) => definition.direction === "lower" ? candidate >= value : candidate <= value).length / values.length) * 100);
    return [{ key: definition.key, label: definition.label, shortLabel: definition.label, description: definition.description, direction: definition.direction, highlightEligible: highlightEligible(definition.key, value, durationMinutes), scoreWeight: metricScoreWeight({ key: definition.key, value }, durationMinutes), value, formattedValue: formatMetric(value, definition.unit), percentile:qualityPercentile, qualityPercentile, tone: performanceTone(qualityPercentile), source: "match",cohortLabel:"۱۰ بازیکن همین Match",confidence:"low",sampleSize:values.length }];
  });
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function valueAt(values: Array<number | null>, index: number) { return values[index] ?? null; }
function timelineState(params: { minute: number; goldDelta: number | null; xpDelta: number | null; lastHitDelta: number | null; impact: number | null; typicalImpact: number; typicalGold: number; typicalXp: number; previousState: TimelineState | null }): TimelineState {
  const { minute, goldDelta, xpDelta, lastHitDelta, impact, typicalImpact, typicalGold, typicalXp, previousState } = params;
  if (impact !== null) {
    const threshold = Math.max(1, typicalImpact);
    if (impact <= -threshold * 1.1 && (previousState === "setback" || previousState === "out")) return "out";
    if (impact < -threshold * .35) return "setback";
    if (impact >= threshold * 1.4) return "surge";
    if (impact > threshold * .2) return "progress";
    return "steady";
  }
  if (goldDelta === null && xpDelta === null) return "steady";
  const goldRatio = typicalGold > 0 ? (goldDelta ?? 0) / typicalGold : 1;
  const xpRatio = typicalXp > 0 ? (xpDelta ?? 0) / typicalXp : 1;
  const pace = goldRatio * .5 + xpRatio * .35 + Math.min(2, (lastHitDelta ?? 0) / 6) * .15;
  const stalled = minute >= 6 && (goldDelta ?? 999) < 120 && (xpDelta ?? 999) < 90;
  if (stalled && (previousState === "setback" || previousState === "out")) return "out";
  if (stalled || pace < .48) return "setback";
  if (pace >= 1.55) return "surge";
  if (pace >= .92) return "progress";
  return "steady";
}
function stateLabel(state: TimelineState) {
  return state === "surge" ? "جهش عملکرد" : state === "progress" ? "روند مثبت" : state === "setback" ? "افت ریتم" : state === "out" ? "دور از جریان مچ" : "ریتم ثابت";
}

function playerTimeline(player: UnknownRecord, durationMinutes: number, stratzStats?: UnknownRecord | null): MatchMinuteSnapshot[] {
  const times = numberArray(player.times);
  const openGold = numberArray(player.gold_t);
  const openXp = numberArray(player.xp_t);
  const openLastHits = numberArray(player.lh_t);
  const openDenies = numberArray(player.dn_t);
  const openDamage = numberArray(player.hero_damage_t);
  const openHealing = numberArray(player.hero_healing_t);
  const gold = openGold.length ? openGold : numberArray(stratzStats?.networthPerMinute);
  const xp = openXp.length ? openXp : numberArray(stratzStats?.experiencePerMinute);
  const lastHits = openLastHits.length ? openLastHits : numberArray(stratzStats?.lastHitsPerMinute);
  const denies = openDenies.length ? openDenies : numberArray(stratzStats?.deniesPerMinute);
  const damage = openDamage.length ? openDamage : numberArray(stratzStats?.heroDamagePerMinute);
  const healing = openHealing.length ? openHealing : numberArray(stratzStats?.healPerMinute);
  const impact = numberArray(stratzStats?.impPerMinute);
  const length = Math.max(times.length, gold.length, xp.length, lastHits.length, impact.length);
  if (length < 2) return [];
  const candidates = Array.from({ length }, (_, index) => ({ index, minute: Math.max(0, Math.round((times[index] ?? index * 60) / 60)) })).filter((entry) => entry.minute <= durationMinutes + 1);
  const byMinute = new Map<number, number>();
  candidates.forEach((entry) => byMinute.set(entry.minute, entry.index));
  const ordered = [...byMinute.entries()].sort((a, b) => a[0] - b[0]);
  const goldDeltas = ordered.slice(1).map(([_, index], i) => (valueAt(gold, index) ?? 0) - (valueAt(gold, ordered[i][1]) ?? 0)).filter((value) => value > 0);
  const xpDeltas = ordered.slice(1).map(([_, index], i) => (valueAt(xp, index) ?? 0) - (valueAt(xp, ordered[i][1]) ?? 0)).filter((value) => value > 0);
  const typicalGold = median(goldDeltas);
  const typicalXp = median(xpDeltas);
  const typicalImpact = median(impact.filter((value): value is number => value !== null).map(Math.abs));
  let previousState: TimelineState | null = null;
  return ordered.map(([minute, index], i) => {
    const previousIndex = i ? ordered[i - 1][1] : null;
    const delta = (values: Array<number | null>) => previousIndex === null || valueAt(values, index) === null || valueAt(values, previousIndex) === null ? null : (valueAt(values, index) as number) - (valueAt(values, previousIndex) as number);
    const goldDelta = delta(gold); const xpDelta = delta(xp); const lastHitDelta = delta(lastHits);
    const impactValue = valueAt(impact, index);
    const state = timelineState({ minute, goldDelta, xpDelta, lastHitDelta, impact: impactValue, typicalImpact, typicalGold, typicalXp, previousState });
    previousState = state;
    return { minute, gold: valueAt(gold, index), xp: valueAt(xp, index), lastHits: valueAt(lastHits, index), denies: valueAt(denies, index), heroDamage: valueAt(damage, index), heroHealing: valueAt(healing, index), impact: impactValue, goldDelta, xpDelta, lastHitDelta, state, label: stateLabel(state) };
  });
}

function teamTimeline(rawMatch: UnknownRecord, durationMinutes: number) {
  const gold = numberArray(rawMatch.radiant_gold_adv); const xp = numberArray(rawMatch.radiant_xp_adv);
  const length = Math.min(Math.max(gold.length, xp.length), durationMinutes + 2);
  return Array.from({ length }, (_, minute) => ({ minute, radiantGoldAdvantage: gold[minute] ?? null, radiantXpAdvantage: xp[minute] ?? null }));
}

const ROLE_POSITION:Record<MatchRole,number>={safe_lane:1,mid_lane:2,off_lane:3,soft_support:4,hard_support:5};

export function buildMatchAnalysis(params: { rawData: unknown; stratzRawData?: unknown; profileAccountId?: number | null; profileHeroId?: number | null; profileAssignedRole?:MatchRole|null; positionOverrides?:Record<string,number>|null;performanceReference?:PerformanceReferenceData }): MatchAnalysis | null {
  const parsed = openDotaMatchSchema.safeParse(params.rawData); const rawMatch = record(params.rawData);
  if (!parsed.success || !rawMatch) return null;
  const durationMinutes = Math.max(1, Math.ceil(parsed.data.duration / 60));
  const rawPlayers = Array.isArray(rawMatch.players) ? rawMatch.players.map(record).filter((player): player is UnknownRecord => Boolean(player)) : [];
  const eligiblePlayers = rawPlayers.filter((player) => { const slot = numeric(player.player_slot); return slot !== null && ((slot >= 0 && slot <= 4) || (slot >= 128 && slot <= 132)); });
  const teamKills = new Map<DotaTeam, number>((["radiant", "dire"] as DotaTeam[]).map((team) => [team, eligiblePlayers.filter((player) => (numeric(player.player_slot) as number) < 128 === (team === "radiant")).reduce((sum, player) => sum + (numeric(player.kills) ?? 0), 0)]));
  const standardPlayers: UnknownRecord[] = eligiblePlayers.map((player): UnknownRecord => { const slot = numeric(player.player_slot) as number; const team = slot < 128 ? "radiant" as DotaTeam : "dire" as DotaTeam; const total = teamKills.get(team) || 0; const kills = numeric(player.kills); const assists = numeric(player.assists); return { ...player, fight_participation: total > 0 && kills !== null && assists !== null ? Math.min(100, (kills + assists) / total * 100) : null }; });
  const stratzMatch = params.stratzRawData as StratzMatch | null;
  const stratzPlayers = new Map((stratzMatch?.players || []).flatMap((player) => typeof player.playerSlot === "number" ? [[player.playerSlot, player] as const] : []));
  const profileSlot = standardPlayers.find((player) => numeric(player.account_id) === params.profileAccountId)?.player_slot ?? standardPlayers.find((player) => numeric(player.hero_id) === params.profileHeroId)?.player_slot;
  const assignedPosition=params.profileAssignedRole?ROLE_POSITION[params.profileAssignedRole]:null;
  const positionResolutions=resolveMatchPositions({players:standardPlayers,stratzRawData:params.stratzRawData,positionOverrides:params.positionOverrides,profileSlot:typeof profileSlot==="number"?profileSlot:null,profileAssignedPosition:assignedPosition});
  const patch=rawMatch.patch==null?null:String(rawMatch.patch),gameMode=numeric(rawMatch.game_mode);
  const players = standardPlayers.flatMap((player): MatchPlayerAnalysis[] => {
    const playerSlot = numeric(player.player_slot); const heroId = numeric(player.hero_id);
    if (playerSlot === null || heroId === null) return [];
    const hero = heroById(heroId); if (!hero) return [];
    const heroMetrics = embeddedBenchmarks(player, durationMinutes);
    const localMetrics=matchBenchmarks(standardPlayers,player,durationMinutes);const heroKeys=new Set(heroMetrics.map((metric)=>metric.key));
    const fallbackMetrics = [...heroMetrics,...localMetrics.filter((metric)=>!heroKeys.has(metric.key))];
    const positionResolution=positionResolutions.get(playerSlot);const position=positionResolution?.detectedPosition??null;
    const currentValues=Object.fromEntries(METRICS.flatMap((definition)=>{const value=metricValue(player,definition.field,durationMinutes,definition.unit);return value===null?[]:[[definition.key,value]];})) as Partial<Record<CohortMetricKey,number>>;
    const cohortAnalysis=buildCohortAnalysis({reference:params.performanceReference,heroId,position,rankTier:numeric(player.rank_tier),patch,gameMode,durationMinutes,currentValues,fallbackMetrics});
    const baseBenchmarks=cohortAnalysis.metrics.map((metric)=>({...metric,highlightEligible:highlightEligible(metric.key,metric.value,durationMinutes)}));
    const stratzStats = record(stratzPlayers.get(playerSlot)?.stats);
    const team=playerSlot<128?"radiant" as DotaTeam:"dire" as DotaTeam;const timeline=playerTimeline(player,durationMinutes,stratzStats);const events=playerEvents(player,standardPlayers,heroId,team);
    const map=buildPlayerMapAnalysis({player,allPlayers:standardPlayers,rawMatch,timeline,events,team,position}),itemTimings=buildItemTimings({player,heroId,position,gameMode,samples:[]});
    const timingRated=itemTimings.filter((item)=>item.relativeToReference!=="unavailable"),timingScore=timingRated.length?Math.round(timingRated.reduce((sum,item)=>sum+(item.relativeToReference==="early"?90:item.relativeToReference==="on_time"?70:35),0)/timingRated.length):null;
    const farmParts=[map.farm.farmUptimePercent,map.farm.recoveryRate,map.farm.farmToImpact].filter((value):value is number=>value!==null),farmScore=farmParts.length?farmParts.reduce((sum,value)=>sum+value,0)/farmParts.length:null;
    const objectiveScore=map.objectives.conversionCount===null?null:Math.max(0,Math.min(100,50+map.objectives.conversionCount*15-(map.objectives.missedConversionCount??0)*12));
    const ownPrepared=map.utility.firstThreatMinute!==null&&map.utility.firstDetectionMinute!==null&&map.utility.firstDetectionMinute<=map.utility.firstThreatMinute,detectionAction=map.utility.invisThreat==="none"?null:ownPrepared?(position&&position<=3?96:88):map.utility.individualContribution;
    const contextual=[scoreMetric("farm_quality","Farm Quality",farmScore,farmScore,"ترکیب Farm Uptime، Recovery و Farm-to-Impact","medium",farmScore!==null),scoreMetric("item_timing","Item Timing",timingScore,timingScore,"زمان‌بندی Itemهای اصلی نسبت به cohort","medium",timingScore!==null),scoreMetric("objective_conversion","Objective Conversion",objectiveScore,objectiveScore,"تبدیل Fight موفق به Objective در ۱۲۰ ثانیه","medium",objectiveScore!==null),scoreMetric("vision_value","Vision Value",map.utility.visionValue,map.utility.visionValue,"کیفیت Ward براساس عمر، Deward و پوشش Objective","medium",map.utility.visionValue!==null),scoreMetric("detection_readiness","Detection Readiness",detectionAction,detectionAction,"خرید Detection متناسب با زمان تهدید و مسئولیت Position","medium",detectionAction!==null)].filter((metric):metric is MatchBenchmarkMetric=>Boolean(metric));
    const benchmarks=baseBenchmarks,sorted=[...benchmarks,...contextual].sort((a,b)=>b.qualityPercentile-a.qualityPercentile),highlightMetrics=sorted.filter((metric)=>metric.highlightEligible!==false);
    return [{ playerSlot, accountId: numeric(player.account_id), heroId, heroName: hero.name, personName: typeof player.personaname === "string" && player.personaname.trim() ? player.personaname.trim() : "حساب خصوصی", team, position, positionLabel: position ? POSITION_LABELS[position] : "نامشخص", positionResolution, isProfilePlayer: playerSlot === profileSlot, kills: numeric(player.kills), deaths: numeric(player.deaths), assists: numeric(player.assists), performanceScore: calculatePerformanceScore([...benchmarks,...contextual], durationMinutes,position), benchmarks,scoreMetrics:contextual, strengths: highlightMetrics.filter((metric) => metric.qualityPercentile >= 80).slice(0, 3), weaknesses: highlightMetrics.filter((metric) => metric.qualityPercentile < 40).reverse().slice(0, 3), timeline,events,map,itemTimings,cohort:cohortAnalysis.profile, benchmarkSource: benchmarks.length ? benchmarks[0].source : "unavailable" }];
  }).sort((a, b) => a.playerSlot - b.playerSlot);
  const benchmarkPlayers = players.filter((player) => player.benchmarks.length).length;
  const timelinePlayers = players.filter((player) => player.timeline.length > 1).length;
  const status = !players.length ? "unavailable" : benchmarkPlayers === players.length && timelinePlayers === players.length ? "ready" : "partial";
  return { status, dotaMatchId: String(parsed.data.match_id), durationMinutes, parsed: timelinePlayers > 0, coverage: { benchmarkPlayers, timelinePlayers, totalPlayers: players.length }, players, teamTimeline: teamTimeline(rawMatch, durationMinutes) };
}
