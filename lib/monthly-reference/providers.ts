import { fetchStratzGraphql } from "../stratz/gateway";
import { monthDate, readMeans, type Means } from "./model";

type Row = Record<string, unknown>;
function object(value: unknown): Row | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null; }
function integer(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) ? value : null; }
function root(value: unknown) {
  const stats = object(object(value)?.data)?.heroStats;
  const result = object(stats);
  if (!result) throw new Error("STRATZ reference response has no heroStats");
  return result;
}

export type MetaRow = { heroId: number; position: number; rankBracket: string; gameMode: number; matchCount: number; winCount: number; positionShare: number; metaPickRate: number; winRate: number };

export function metaQuery(rank: string, mode: string, take = 2) {
  const selections = [1, 2, 3, 4, 5].map(position =>
    `pos${position}: winMonth(take: ${take}, bracketIds: [${rank}], positionIds: [POSITION_${position}], gameModeIds: [${mode}]) { month heroId matchCount winCount }`,
  );
  return `query MonthlyMeta { heroStats { ${selections.join("\n")} } }`;
}

export function parseMeta(value: unknown, month: Date, rank: string, mode: number): MetaRow[] {
  const data = root(value);
  const target = month.getTime() / 1_000;
  const rows: Array<Omit<MetaRow, "positionShare" | "metaPickRate" | "winRate">> = [];
  for (let position = 1; position <= 5; position++) {
    const raw = data[`pos${position}`];
    if (!Array.isArray(raw)) throw new Error(`STRATZ meta pos${position} missing`);
    for (const item of raw) {
      const row = object(item);
      if (integer(row?.month) !== target) continue;
      const heroId = integer(row?.heroId), matchCount = integer(row?.matchCount), winCount = integer(row?.winCount);
      if (heroId === null || matchCount === null || winCount === null || matchCount < 0 || winCount < 0 || winCount > matchCount) throw new Error(`Invalid STRATZ meta row for ${monthDate(month)}`);
      rows.push({ heroId, position, rankBracket: rank, gameMode: mode, matchCount, winCount });
    }
  }
  if (rows.length < 5) throw new Error(`STRATZ has insufficient monthly meta for ${monthDate(month)}`);
  const heroTotals = new Map<number, number>(), positionTotals = new Map<number, number>();
  for (const row of rows) {
    heroTotals.set(row.heroId, (heroTotals.get(row.heroId) ?? 0) + row.matchCount);
    positionTotals.set(row.position, (positionTotals.get(row.position) ?? 0) + row.matchCount);
  }
  return rows.map(row => ({ ...row,
    positionShare: heroTotals.get(row.heroId) ? row.matchCount / heroTotals.get(row.heroId)! * 100 : 0,
    metaPickRate: positionTotals.get(row.position) ? row.matchCount / positionTotals.get(row.position)! * 100 : 0,
    winRate: row.matchCount ? row.winCount / row.matchCount * 100 : 0,
  }));
}

export async function fetchMonthlyMeta(month: Date, rank: string, mode: { id: number; name: string }) {
  const now = new Date();
  const monthsBack = (now.getUTCFullYear() - month.getUTCFullYear()) * 12 + now.getUTCMonth() - month.getUTCMonth();
  if (monthsBack < 1 || monthsBack > 11) throw new Error("Reference month is outside the 11-month backfill request limit");
  return parseMeta(await fetchStratzGraphql(metaQuery(rank, mode.name, monthsBack + 1), "MonthlyMeta"), month, rank, mode.id);
}

export type PerformanceRow = { heroId: number; position: number; rankGroup: string; minute: number; sampleCount: number; means: Means };
export function performanceQuery(week: number, rank: string, heroIds: number[]) {
  if (!heroIds.length || !heroIds.every(Number.isSafeInteger)) throw new Error("Invalid reference heroes");
  return `query MonthlyPerformance { heroStats { stats(week: ${week / 1_000}, heroIds: [${heroIds.join(",")}], bracketBasicIds: [${rank}], positionIds: [POSITION_1,POSITION_2,POSITION_3,POSITION_4,POSITION_5], groupByTime: true, groupByPosition: true, groupByBracket: true, minTime: 0, maxTime: 75) { heroId week time position bracketBasicIds matchCount remainingMatchCount cs dn kills deaths assists networth xp heroDamage towerDamage healingAllies campsStacked neutrals ancients teamKills } } }`;
}
export function parsePerformance(value: unknown, week: number, rank: string, heroIds: number[]): PerformanceRow[] {
  const values = root(value).stats;
  if (!Array.isArray(values)) throw new Error("STRATZ performance response missing stats");
  const allowed = new Set(heroIds);
  const rows: PerformanceRow[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const row = object(item);
    const heroId = integer(row?.heroId), minute = integer(row?.time), returnedWeek = integer(row?.week);
    const position = typeof row?.position === "string" ? Number(row.position.match(/^POSITION_([1-5])$/)?.[1]) : NaN;
    const count = integer(row?.remainingMatchCount ?? row?.matchCount);
    if (!heroId || !allowed.has(heroId) || returnedWeek !== week / (7 * 86_400_000) || row?.bracketBasicIds !== rank || !Number.isInteger(position) || minute === null || minute < 0 || minute > 75 || count === null || count < 0) throw new Error("Invalid STRATZ performance cohort row");
    if (count === 0) continue;
    const key = `${heroId}:${position}:${minute}`;
    if (seen.has(key)) throw new Error("Duplicate STRATZ performance cohort row");
    seen.add(key);
    rows.push({ heroId, position, rankGroup: rank, minute, sampleCount: count, means: readMeans(row!) });
  }
  return rows;
}
export async function fetchMonthlyPerformance(job: { week: number; rank: string; heroIds: number[] }) {
  return parsePerformance(await fetchStratzGraphql(performanceQuery(job.week, job.rank, job.heroIds), "MonthlyPerformance"), job.week, job.rank, job.heroIds);
}
