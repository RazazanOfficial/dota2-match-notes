import { fetchStratzGraphql } from "../stratz/gateway";
import { monthDate, readMeans, weekStartsInMonth, monthIsSettled, RANKS, MODES, type Means } from "./model";
import { MonthlyMetaPendingError } from "./availability";

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

const WEEK = 604_800_000;
const PAGE_WEEKS = 8;
type WeeklyMetaRow = { week: number; heroId: number; matchCount: number; winCount: number };

export function metaQuery(rank: string, mode: string, position: number, take = PAGE_WEEKS, skip = 0) {
  if (!RANKS.some(value => value === rank) || !MODES.some(value => value.name === mode) ||
    !Number.isInteger(position) || position < 1 || position > 5 || !Number.isInteger(take) || take < 1 || take > PAGE_WEEKS ||
    !Number.isInteger(skip) || skip < 0 || skip > 64) throw new Error("Invalid weekly Meta query scope");
  return `query MonthlyMeta { heroStats { pos${position}: winWeek(take: ${take}, skip: ${skip}, bracketIds: [${rank}], positionIds: [POSITION_${position}], gameModeIds: [${mode}]) { week heroId matchCount winCount } } }`;
}

export function parseWeeklyMetaPage(value: unknown, position: number): WeeklyMetaRow[] {
  const raw = root(value)[`pos${position}`];
  if (!Array.isArray(raw)) throw new Error(`STRATZ weekly Meta pos${position} missing`);
  const seen = new Set<string>();
  return raw.map(item => {
    const row = object(item);
    const week = integer(row?.week), heroId = integer(row?.heroId), matchCount = integer(row?.matchCount), winCount = integer(row?.winCount);
    if (week === null || week < 946684800 || week > 4102444800 || (week * 1000) % WEEK !== 0) throw new Error("Invalid STRATZ Meta week timestamp");
    if (heroId === null || heroId < 1 || heroId > 32767 || matchCount === null || winCount === null ||
      matchCount < 0 || matchCount > 2147483647 || winCount < 0 || winCount > matchCount) throw new Error("Invalid STRATZ weekly Meta counts");
    const key = `${week}:${heroId}`;
    if (seen.has(key)) throw new Error("Duplicate STRATZ weekly Meta row");
    seen.add(key);
    return { week, heroId, matchCount, winCount };
  });
}

function requireWeeks(rows: WeeklyMetaRow[], month: Date, position: number) {
  const expected = weekStartsInMonth(month).map(week => week / 1000);
  const available = new Set(rows.filter(row => row.matchCount > 0).map(row => row.week));
  const missing = expected.filter(week => !available.has(week));
  if (missing.length) throw new MonthlyMetaPendingError(monthDate(month), [...available].sort((a,b)=>a-b).map(week=>monthDate(new Date(week*1000))), missing.map(week=>monthDate(new Date(week*1000))), position);
}

export function parseMeta(value: unknown, month: Date, rank: string, mode: number): MetaRow[] {
  const wanted = new Set(weekStartsInMonth(month).map(week => week / 1000));
  const data = root(value);
  const totals = new Map<string, Omit<MetaRow, "positionShare" | "metaPickRate" | "winRate">>();
  for (let position = 1; position <= 5; position++) {
    const source = parseWeeklyMetaPage({ data: { heroStats: data } }, position);
    requireWeeks(source, month, position);
    for (const row of source) {
      if (!wanted.has(row.week) || row.matchCount === 0) continue;
      const key = `${row.heroId}:${position}`;
      const existing = totals.get(key) || { heroId: row.heroId, position, rankBracket: rank, gameMode: mode, matchCount: 0, winCount: 0 };
      existing.matchCount += row.matchCount;
      existing.winCount += row.winCount;
      if (existing.matchCount > 2147483647) throw new Error("Monthly Meta count exceeds database integer capacity");
      totals.set(key, existing);
    }
  }
  const rows = [...totals.values()];
  const heroTotals = new Map<number, number>(), positionTotals = new Map<number, number>();
  for (const row of rows) {
    heroTotals.set(row.heroId, (heroTotals.get(row.heroId) ?? 0) + row.matchCount);
    positionTotals.set(row.position, (positionTotals.get(row.position) ?? 0) + row.matchCount);
  }
  return rows.map(row => ({ ...row,
    positionShare: row.matchCount / heroTotals.get(row.heroId)! * 100,
    metaPickRate: row.matchCount / positionTotals.get(row.position)! * 100,
    winRate: row.winCount / row.matchCount * 100,
  }));
}

export async function fetchMonthlyMeta(month: Date, rank: string, mode: { id: number; name: string }, fetch = fetchStratzGraphql, now = new Date()) {
  const monthsBack = (now.getUTCFullYear() - month.getUTCFullYear()) * 12 + now.getUTCMonth() - month.getUTCMonth();
  if (monthsBack < 1 || monthsBack > 11 || month.getTime() !== new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).getTime()) throw new Error("Reference month is outside the 11-month backfill request limit");
  if (!monthIsSettled(month, now)) throw new Error("Reference week window has not settled");
  const expected = weekStartsInMonth(month).map(week => week / 1000);
  // Scan bounded pages from the actual newest source week, without assuming it is current.
  const maxPages = Math.ceil((Math.floor(now.getTime() / WEEK) - expected[0] / (WEEK / 1000) + PAGE_WEEKS) / PAGE_WEEKS);
  const collected: Record<string, WeeklyMetaRow[]> = {};
  for (let position = 1; position <= 5; position++) {
    const rows: WeeklyMetaRow[] = [], seen = new Set<string>();
    for (let page = 0; page < maxPages; page++) {
      const values = parseWeeklyMetaPage(await fetch(metaQuery(rank, mode.name, position, PAGE_WEEKS, page * PAGE_WEEKS), "MonthlyMeta"), position);
      for (const row of values) {
        const key = `${row.week}:${row.heroId}`;
        if (seen.has(key)) throw new Error("Overlapping STRATZ weekly Meta pages");
        seen.add(key); rows.push(row);
      }
      const available = new Set(rows.filter(row=>row.matchCount > 0).map(row=>row.week));
      if (expected.every(week=>available.has(week))) break;
      if (!values.length || Math.min(...values.map(row=>row.week)) < expected[0]) break;
    }
    requireWeeks(rows, month, position);
    collected[`pos${position}`] = rows;
  }
  return parseMeta({ data: { heroStats: collected } }, month, rank, mode.id);
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
export async function fetchMonthlyPerformance(job: { week: number; rank: string; heroIds: number[] }, fetch = fetchStratzGraphql) {
  if (!job.heroIds.length || new Set(job.heroIds).size !== job.heroIds.length) throw new Error("Invalid reference hero batch");
  const rows: PerformanceRow[] = [];
  // Preserve existing four-hero jobs/cursors. Each network response is one hero,
  // all five positions, all 76 minutes and all 14 metrics. No DB write occurs
  // until every subrequest for this job has completed and passed validation.
  for (const heroId of job.heroIds) {
    const raw = await fetch(performanceQuery(job.week, job.rank, [heroId]), "MonthlyPerformance");
    rows.push(...parsePerformance(raw, job.week, job.rank, [heroId]));
  }
  return rows;
}
