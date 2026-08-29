import { heroById } from "../../data/heroes";
import type { DotaTeam, MatchAnalysis, MatchBenchmarkMetric, MatchMinuteSnapshot, MatchPlayerAnalysis, PerformanceTone, TimelineState } from "../types";
import { openDotaMatchSchema } from "../opendota/validation";
import type { StratzMatch } from "../stratz/validation";

type UnknownRecord = Record<string, unknown>;

const METRICS = [
  { key: "gold_per_min", label: "درآمد طلا", field: "gold_per_min", unit: "number" },
  { key: "xp_per_min", label: "کسب تجربه", field: "xp_per_min", unit: "number" },
  { key: "kills_per_min", label: "کیل", field: "kills", unit: "perMinute" },
  { key: "deaths_per_min", label: "مرگ", field: "deaths", unit: "perMinute", inverse: true },
  { key: "assists_per_min", label: "اسیست", field: "assists", unit: "perMinute" },
  { key: "last_hits_per_min", label: "لست‌هیت", field: "last_hits", unit: "perMinute" },
  { key: "denies_per_min", label: "دِنای", field: "denies", unit: "perMinute" },
  { key: "hero_damage_per_min", label: "دمیج هیرو", field: "hero_damage", unit: "perMinute" },
  { key: "hero_healing_per_min", label: "هیل", field: "hero_healing", unit: "perMinute" },
  { key: "tower_damage", label: "دمیج ساختمان", field: "tower_damage", unit: "number" },
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
function tone(percentile: number): PerformanceTone {
  if (percentile >= 85) return "elite";
  if (percentile >= 65) return "strong";
  if (percentile >= 35) return "steady";
  if (percentile >= 15) return "weak";
  return "critical";
}
function metricValue(player: UnknownRecord, field: string, durationMinutes: number, unit: string) {
  const raw = numeric(player[field]);
  if (raw === null) return null;
  return unit === "perMinute" ? raw / Math.max(1, durationMinutes) : raw;
}
function formatMetric(value: number, unit: string) {
  if (unit === "perMinute") return value.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
  return Math.round(value).toLocaleString("fa-IR");
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
    const qualityPercentile = "inverse" in definition && definition.inverse ? 100 - percentile : percentile;
    return [{ key: definition.key, label: definition.label, value: rawValue, formattedValue: formatMetric(rawValue, definition.unit), percentile, qualityPercentile, tone: tone(qualityPercentile), source: "hero" }];
  });
}

function matchBenchmarks(players: UnknownRecord[], player: UnknownRecord, durationMinutes: number) {
  return METRICS.flatMap((definition): MatchBenchmarkMetric[] => {
    const value = metricValue(player, definition.field, durationMinutes, definition.unit);
    if (value === null) return [];
    const values = players.map((candidate) => metricValue(candidate, definition.field, durationMinutes, definition.unit)).filter((candidate): candidate is number => candidate !== null).sort((a, b) => a - b);
    if (values.length < 5) return [];
    const percentile = Math.round((values.filter((candidate) => candidate <= value).length / values.length) * 100);
    const qualityPercentile = "inverse" in definition && definition.inverse ? 100 - percentile : percentile;
    return [{ key: definition.key, label: definition.label, value, formattedValue: formatMetric(value, definition.unit), percentile, qualityPercentile, tone: tone(qualityPercentile), source: "match" }];
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

function stratzPositions(rawData: unknown) {
  const match = rawData as StratzMatch | null;
  const positions = new Map<number, number>();
  for (const player of match?.players || []) {
    if (typeof player.playerSlot !== "number") continue;
    const parsed = /^POSITION_([1-5])$/.exec(player.position || "");
    if (parsed) positions.set(player.playerSlot, Number(parsed[1]));
  }
  return positions;
}
function inferredPosition(player: UnknownRecord) {
  const position = numeric(player.position_est);
  if (position && position >= 1 && position <= 5) return Math.round(position);
  const laneRole = numeric(player.lane_role);
  if (laneRole && laneRole >= 1 && laneRole <= 3) return Math.round(laneRole);
  return null;
}
function teamTimeline(rawMatch: UnknownRecord, durationMinutes: number) {
  const gold = numberArray(rawMatch.radiant_gold_adv); const xp = numberArray(rawMatch.radiant_xp_adv);
  const length = Math.min(Math.max(gold.length, xp.length), durationMinutes + 2);
  return Array.from({ length }, (_, minute) => ({ minute, radiantGoldAdvantage: gold[minute] ?? null, radiantXpAdvantage: xp[minute] ?? null }));
}

export function buildMatchAnalysis(params: { rawData: unknown; stratzRawData?: unknown; profileAccountId?: number | null; profileHeroId?: number | null }): MatchAnalysis | null {
  const parsed = openDotaMatchSchema.safeParse(params.rawData); const rawMatch = record(params.rawData);
  if (!parsed.success || !rawMatch) return null;
  const durationMinutes = Math.max(1, Math.ceil(parsed.data.duration / 60));
  const rawPlayers = Array.isArray(rawMatch.players) ? rawMatch.players.map(record).filter((player): player is UnknownRecord => Boolean(player)) : [];
  const standardPlayers = rawPlayers.filter((player) => { const slot = numeric(player.player_slot); return slot !== null && ((slot >= 0 && slot <= 4) || (slot >= 128 && slot <= 132)); });
  const positions = stratzPositions(params.stratzRawData);
  const stratzMatch = params.stratzRawData as StratzMatch | null;
  const stratzPlayers = new Map((stratzMatch?.players || []).flatMap((player) => typeof player.playerSlot === "number" ? [[player.playerSlot, player] as const] : []));
  const profileSlot = standardPlayers.find((player) => numeric(player.account_id) === params.profileAccountId)?.player_slot ?? standardPlayers.find((player) => numeric(player.hero_id) === params.profileHeroId)?.player_slot;
  const players = standardPlayers.flatMap((player): MatchPlayerAnalysis[] => {
    const playerSlot = numeric(player.player_slot); const heroId = numeric(player.hero_id);
    if (playerSlot === null || heroId === null) return [];
    const hero = heroById(heroId); if (!hero) return [];
    const heroMetrics = embeddedBenchmarks(player, durationMinutes);
    const benchmarks = heroMetrics.length >= 4 ? heroMetrics : matchBenchmarks(standardPlayers, player, durationMinutes);
    const position = positions.get(playerSlot) ?? inferredPosition(player);
    const sorted = [...benchmarks].sort((a, b) => b.qualityPercentile - a.qualityPercentile);
    const stratzStats = record(stratzPlayers.get(playerSlot)?.stats);
    return [{ playerSlot, accountId: numeric(player.account_id), heroId, heroName: hero.name, personName: typeof player.personaname === "string" && player.personaname.trim() ? player.personaname.trim() : "حساب خصوصی", team: playerSlot < 128 ? "radiant" as DotaTeam : "dire" as DotaTeam, position, positionLabel: position ? POSITION_LABELS[position] : "نامشخص", isProfilePlayer: playerSlot === profileSlot, benchmarks, strengths: sorted.filter((metric) => metric.qualityPercentile >= 65).slice(0, 3), weaknesses: sorted.filter((metric) => metric.qualityPercentile < 35).reverse().slice(0, 3), timeline: playerTimeline(player, durationMinutes, stratzStats), benchmarkSource: benchmarks.length ? benchmarks[0].source : "unavailable" }];
  }).sort((a, b) => a.playerSlot - b.playerSlot);
  const benchmarkPlayers = players.filter((player) => player.benchmarks.length).length;
  const timelinePlayers = players.filter((player) => player.timeline.length > 1).length;
  const status = !players.length ? "unavailable" : benchmarkPlayers === players.length && timelinePlayers === players.length ? "ready" : "partial";
  return { status, dotaMatchId: String(parsed.data.match_id), durationMinutes, parsed: timelinePlayers > 0, coverage: { benchmarkPlayers, timelinePlayers, totalPlayers: players.length }, players, teamTimeline: teamTimeline(rawMatch, durationMinutes) };
}
