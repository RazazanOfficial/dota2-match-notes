import { HEROES } from "../../data/heroes";
import { fetchOpenDotaJson } from "../opendota/client";
import { OpenDotaError } from "../opendota/errors";
import { fetchStratzGraphql } from "../stratz/gateway";

type UnknownRecord = Record<string, unknown>;
const RANK_BRACKETS = ["HERALD", "GUARDIAN", "CRUSADER", "ARCHON", "LEGEND", "ANCIENT", "DIVINE", "IMMORTAL"] as const;
const GAME_MODES = [{ id: 22, enumName: "ALL_PICK_RANKED" }, { id: 23, enumName: "TURBO" }] as const;
const METRIC_KEYS = new Set(["gold_per_min", "xp_per_min", "kills_per_min", "last_hits_per_min", "hero_damage_per_min", "hero_healing_per_min", "tower_damage"]);

export interface ExternalHeroPositionRow {
  heroId: number;
  position: number;
  rankBracket: string;
  gameMode: number;
  matchCount: number;
  winCount: number;
  positionShare: number;
  metaPickRate: number;
  winRate: number;
}

export interface ExternalBenchmarkRow {
  heroId: number;
  metric: string;
  quantiles: Array<{ percentile: number; value: number }>;
}

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function finite(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildHeroMetaQuery(rankBracket: string, gameMode: string) {
  const selections = [1, 2, 3, 4, 5].map((position) =>
    `pos${position}: winWeek(take: 1, bracketIds: [${rankBracket}], positionIds: [POSITION_${position}], gameModeIds: [${gameMode}]) { heroId matchCount winCount }`,
  ).join("\n");
  return `query PerformanceMeta { heroStats { ${selections} } }`;
}

export function parseHeroMetaResponse(raw: unknown, rankBracket: string, gameMode: number): ExternalHeroPositionRow[] {
  const heroStats = record(record(record(raw)?.data)?.heroStats);
  if (!heroStats) throw new Error("STRATZ meta response is missing data.heroStats");
  const base: Array<Omit<ExternalHeroPositionRow, "positionShare" | "metaPickRate" | "winRate">> = [];
  for (let position = 1; position <= 5; position += 1) {
    const values = heroStats[`pos${position}`];
    if (!Array.isArray(values)) throw new Error(`STRATZ meta response is missing pos${position}`);
    for (const value of values) {
      const row = record(value);
      const heroId = finite(row?.heroId);
      const matchCount = finite(row?.matchCount);
      const winCount = finite(row?.winCount);
      if (heroId === null || matchCount === null || winCount === null || matchCount < 0 || winCount < 0 || winCount > matchCount) continue;
      base.push({ heroId: Math.trunc(heroId), position, rankBracket, gameMode, matchCount: Math.trunc(matchCount), winCount: Math.trunc(winCount) });
    }
  }
  const heroTotals = new Map<number, number>();
  const positionTotals = new Map<number, number>();
  for (const row of base) {
    heroTotals.set(row.heroId, (heroTotals.get(row.heroId) ?? 0) + row.matchCount);
    positionTotals.set(row.position, (positionTotals.get(row.position) ?? 0) + row.matchCount);
  }
  return base.map((row) => ({
    ...row,
    positionShare: heroTotals.get(row.heroId) ? row.matchCount / (heroTotals.get(row.heroId) as number) * 100 : 0,
    metaPickRate: positionTotals.get(row.position) ? row.matchCount / (positionTotals.get(row.position) as number) * 100 : 0,
    winRate: row.matchCount ? row.winCount / row.matchCount * 100 : 0,
  }));
}

export function parseOpenDotaBenchmarks(raw: unknown, expectedHeroId: number): ExternalBenchmarkRow[] {
  const root = record(raw);
  const heroId = finite(root?.hero_id);
  if (heroId !== null && Math.trunc(heroId) !== expectedHeroId) throw new Error("OpenDota benchmark hero mismatch");
  const result = record(root?.result);
  if (!result) throw new Error("OpenDota benchmark response is missing result");
  return Object.entries(result).flatMap(([metric, value]) => {
    if (!METRIC_KEYS.has(metric) || !Array.isArray(value)) return [];
    const quantiles = value.flatMap((entry) => {
      const point = record(entry);
      const percentile = finite(point?.percentile);
      const metricValue = finite(point?.value);
      return percentile === null || metricValue === null ? [] : [{ percentile, value: metricValue }];
    }).sort((a, b) => a.percentile - b.percentile);
    return quantiles.length >= 3 ? [{ heroId: expectedHeroId, metric, quantiles }] : [];
  });
}

export async function fetchAllHeroPositionMeta() {
  const rows: ExternalHeroPositionRow[] = [];
  for (const rank of RANK_BRACKETS) {
    for (const mode of GAME_MODES) {
      const raw = await fetchStratzGraphql(buildHeroMetaQuery(rank, mode.enumName), "PerformanceMeta");
      rows.push(...parseHeroMetaResponse(raw, rank, mode.id));
    }
  }
  return rows;
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchHeroBenchmarks(heroId: number) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await fetchOpenDotaJson(`benchmarks?hero_id=${heroId}`, {
        code: "opendota_benchmark_not_found",
        message: "Benchmark این Hero پیدا نشد",
      });
      return parseOpenDotaBenchmarks(raw, heroId);
    } catch (error) {
      if (!(error instanceof OpenDotaError) || error.status !== 429 || attempt === 3) throw error;
      await sleep(Math.max(1, error.retryAfterSeconds ?? attempt * 2) * 1_000);
    }
  }
  return [];
}

export async function fetchAllHeroBenchmarks() {
  const rows: ExternalBenchmarkRow[] = [];
  // Two requests per 2.1 seconds stays below the public 60 requests/minute
  // ceiling while keeping the full 72-hour refresh inside the worker timeout.
  for (let index = 0; index < HEROES.length; index += 2) {
    const batch = HEROES.slice(index, index + 2);
    const results = await Promise.allSettled(batch.map((hero) => fetchHeroBenchmarks(hero.id)));
    for (const result of results) if (result.status === "fulfilled") rows.push(...result.value);
    if (index + 2 < HEROES.length) await sleep(2_100);
  }
  return rows;
}
