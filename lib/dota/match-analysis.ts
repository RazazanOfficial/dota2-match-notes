import { heroById } from "../../data/heroes";
import type { DotaTeam, MatchAnalysis, MatchAnalysisEvent, MatchBenchmarkMetric, MatchMapAnalysis, MatchMapPoint, MatchMinuteSnapshot, MatchPlayerAnalysis, MatchRole, TimelineState } from "../types";
import { openDotaMatchSchema } from "../opendota/validation";
import type { StratzMatch } from "../stratz/validation";
import { calculatePerformanceScoreOrNull, metricScoreWeight, performanceTone } from "./performance-score";
import { buildPlayerMapAnalysis, playerEvents } from "./match-map-analysis";
import { buildCohortAnalysis, type CohortMetricKey, type PerformanceReferenceData } from "./performance-cohort";
import { resolveMatchPositions } from "./position-resolver";
import { buildLaneImpact } from "./lane-impact-analysis";
import { buildItemOwnershipAnalysis } from "./item-ownership-analysis";

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

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function valueAt(values: Array<number | null>, index: number) { return values[index] ?? null; }
function timelineState(params: { minute: number; goldDelta: number | null; xpDelta: number | null; lastHitDelta: number | null; typicalGold: number; typicalXp: number; previousState: TimelineState | null }): TimelineState {
  const { minute, goldDelta, xpDelta, lastHitDelta, typicalGold, typicalXp, previousState } = params;
  if (goldDelta === null && xpDelta === null) return "steady";
  const goldRatio = typicalGold > 0 ? (goldDelta ?? 0) / typicalGold : 1;
  const xpRatio = typicalXp > 0 ? (xpDelta ?? 0) / typicalXp : 1;
  const pace = goldRatio * .5 + xpRatio * .35 + Math.min(2, (lastHitDelta ?? 0) / 6) * .15;
  const stalled = minute >= 6 && (goldDelta ?? 999) < 70 && (xpDelta ?? 999) < 60;
  if (stalled && (previousState === "setback" || previousState === "out")) return "out";
  if (stalled || pace < .3) return "setback";
  if (pace >= 1.35) return "surge";
  if (pace >= .72) return "progress";
  return "steady";
}
function stateLabel(state: TimelineState) {
  return state === "surge" ? "رشد سریع" : state === "progress" ? "رشد معمول" : state === "setback" ? "رشد کم" : state === "out" ? "توقف رشد" : "ریتم ثابت";
}

function cumulative(values: Array<number | null>) {
  let total = 0;
  return values.map((value) => value === null ? null : (total += value));
}

function playerTimeline(player: UnknownRecord, durationMinutes: number, stratzStats?: UnknownRecord | null): MatchMinuteSnapshot[] {
  const times = numberArray(player.times);
  const openGold = numberArray(player.gold_t);
  const openXp = numberArray(player.xp_t);
  const openLastHits = numberArray(player.lh_t);
  const openDenies = numberArray(player.dn_t);
  const openDamage = numberArray(player.hero_damage_t);
  const openHealing = numberArray(player.hero_healing_t);
  const stratzNetWorth = numberArray(stratzStats?.networthPerMinute);
  const usingOpenTimeline = [openGold, openXp, openLastHits, openDenies].some((values) => values.length > 1);
  const gold = stratzNetWorth.length ? (usingOpenTimeline ? [null, ...stratzNetWorth] : stratzNetWorth) : openGold;
  const xp = openXp.length ? openXp : cumulative(numberArray(stratzStats?.experiencePerMinute));
  const lastHits = openLastHits.length ? openLastHits : cumulative(numberArray(stratzStats?.lastHitsPerMinute));
  const denies = openDenies.length ? openDenies : cumulative(numberArray(stratzStats?.deniesPerMinute));
  const damage = openDamage.length ? openDamage : cumulative(numberArray(stratzStats?.heroDamagePerMinute));
  const healing = openHealing.length ? openHealing : cumulative(numberArray(stratzStats?.healPerMinute));
  const impact = numberArray(stratzStats?.impPerMinute);
  const length = Math.max(times.length, gold.length, xp.length, lastHits.length, impact.length);
  if (length < 2) return [];
  const candidates = Array.from({ length }, (_, index) => ({ index, minute: usingOpenTimeline ? Math.max(0, Math.round((times[index] ?? index * 60) / 60)) : index + 1 })).filter((entry) => entry.minute <= durationMinutes + 1);
  const byMinute = new Map<number, number>();
  candidates.forEach((entry) => byMinute.set(entry.minute, entry.index));
  const ordered = [...byMinute.entries()].sort((a, b) => a[0] - b[0]);
  const goldDeltas = ordered.slice(1).map(([_, index], i) => (valueAt(gold, index) ?? 0) - (valueAt(gold, ordered[i][1]) ?? 0)).filter((value) => value > 0);
  const xpDeltas = ordered.slice(1).map(([_, index], i) => (valueAt(xp, index) ?? 0) - (valueAt(xp, ordered[i][1]) ?? 0)).filter((value) => value > 0);
  const typicalGold = median(goldDeltas);
  const typicalXp = median(xpDeltas);
  let previousState: TimelineState | null = null;
  return ordered.map(([minute, index], i) => {
    const previousIndex = i ? ordered[i - 1][1] : null;
    const delta = (values: Array<number | null>) => previousIndex === null || valueAt(values, index) === null || valueAt(values, previousIndex) === null ? null : (valueAt(values, index) as number) - (valueAt(values, previousIndex) as number);
    const goldDelta = delta(gold); const xpDelta = delta(xp); const lastHitDelta = delta(lastHits);
    const impactValue = valueAt(impact, index);
    const state = timelineState({ minute, goldDelta, xpDelta, lastHitDelta, typicalGold, typicalXp, previousState });
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
  const ownershipEvents=buildItemOwnershipAnalysis(standardPlayers);
  const positionBySlot=new Map<number,number|null>(standardPlayers.flatMap((player)=>{const slot=numeric(player.player_slot);return slot===null?[]:[[slot,positionResolutions.get(slot)?.detectedPosition??null] as const];}));
  const initialPlayers = standardPlayers.flatMap((player): MatchPlayerAnalysis[] => {
    const playerSlot = numeric(player.player_slot); const heroId = numeric(player.hero_id);
    if (playerSlot === null || heroId === null) return [];
    const hero = heroById(heroId); if (!hero) return [];
    const heroMetrics = embeddedBenchmarks(player, durationMinutes);
    // The ten players in this match provide context, never a statistical baseline.
    const fallbackMetrics = heroMetrics;
    const positionResolution=positionResolutions.get(playerSlot);const position=positionResolution?.detectedPosition??null;
    const currentValues=Object.fromEntries(METRICS.flatMap((definition)=>{const value=metricValue(player,definition.field,durationMinutes,definition.unit);return value===null?[]:[[definition.key,value]];})) as Partial<Record<CohortMetricKey,number>>;
    const cohortAnalysis=buildCohortAnalysis({reference:params.performanceReference,heroId,position,rankTier:numeric(player.rank_tier),patch,gameMode,durationMinutes,currentValues,fallbackMetrics});
    const baseBenchmarks=cohortAnalysis.metrics.map((metric)=>({...metric,highlightEligible:highlightEligible(metric.key,metric.value,durationMinutes)}));
    const stratzStats = record(stratzPlayers.get(playerSlot)?.stats);
    const team=playerSlot<128?"radiant" as DotaTeam:"dire" as DotaTeam;const timeline=playerTimeline(player,durationMinutes,stratzStats);const events=playerEvents(player,standardPlayers,heroId,team);
    const map=buildPlayerMapAnalysis({player,allPlayers:standardPlayers,rawMatch,timeline,events,team,position});
    const benchmarks=baseBenchmarks,scoreMetrics=benchmarks.filter((metric)=>metric.source!=="match"),sorted=[...benchmarks].sort((a,b)=>b.qualityPercentile-a.qualityPercentile),highlightMetrics=sorted.filter((metric)=>metric.highlightEligible!==false);
    const performanceScore=calculatePerformanceScoreOrNull(scoreMetrics,durationMinutes,position);
    const timelineSource = timeline.length < 2 ? "unavailable" as const : [openXpForPlayer(player), numberArray(player.lh_t)].some((values)=>values.length>1) ? "opendota" as const : "stratz" as const;
    return [{ playerSlot, accountId: numeric(player.account_id), heroId, heroName: hero.name, personName: typeof player.personaname === "string" && player.personaname.trim() ? player.personaname.trim() : "حساب خصوصی", team, position, positionLabel: position ? POSITION_LABELS[position] : "نامشخص", positionResolution, isProfilePlayer: playerSlot === profileSlot, kills: numeric(player.kills), deaths: numeric(player.deaths), assists: numeric(player.assists), lastHits:numeric(player.last_hits), denies:numeric(player.denies), heroDamage:numeric(player.hero_damage), heroHealing:numeric(player.hero_healing), towerDamage:numeric(player.tower_damage), ...(performanceScore===null?{}:{performanceScore}), benchmarks,scoreMetrics, strengths: highlightMetrics.filter((metric) => metric.qualityPercentile >= 80).slice(0, 3), weaknesses: highlightMetrics.filter((metric) => metric.qualityPercentile < 40).reverse().slice(0, 3), timeline,timelineSource,events,map,itemTimings:[],cohort:cohortAnalysis.profile,ownershipEvents:ownershipEvents.filter((event)=>event.purchaserPlayerSlot===playerSlot||event.holderPlayerSlot===playerSlot), benchmarkSource: benchmarks.length ? benchmarks[0].source : "unavailable" }];
  }).sort((a, b) => a.playerSlot - b.playerSlot);
  const rawBySlot=new Map(standardPlayers.flatMap((player)=>{const slot=numeric(player.player_slot);return slot===null?[]:[[slot,player] as const];}));
  const timelinesBySlot=new Map(initialPlayers.map((entry)=>[entry.playerSlot,entry.timeline]));
  const players=initialPlayers.map((entry)=>{const raw=rawBySlot.get(entry.playerSlot);return raw?{...entry,laneImpact:buildLaneImpact({player:raw,playerPosition:entry.position,players:standardPlayers,positions:positionBySlot,timeline:entry.timeline,timelines:timelinesBySlot,events:entry.events??[]})}:entry;});
  const benchmarkPlayers = players.filter((player) => player.benchmarks.length).length;
  const timelinePlayers = players.filter((player) => player.timeline.length > 1).length;
  const status = !players.length ? "unavailable" : benchmarkPlayers === players.length && timelinePlayers === players.length ? "ready" : "partial";
  const replayParsed = standardPlayers.some((player) => numberArray(player.times).length > 1 && numberArray(player.lh_t).length > 1)
    || (recordsCount(rawMatch.objectives) > 0 && standardPlayers.some((player) => record(player.lane_pos) !== null));
  return { status, dotaMatchId: String(parsed.data.match_id), durationMinutes, parsed: replayParsed, coverage: { benchmarkPlayers, timelinePlayers, totalPlayers: players.length }, players,ownershipEvents, teamTimeline: teamTimeline(rawMatch, durationMinutes) };
}

function openXpForPlayer(player: UnknownRecord) { return numberArray(player.xp_t); }
function recordsCount(value: unknown) { return Array.isArray(value) ? value.length : 0; }
