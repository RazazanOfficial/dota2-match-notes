import { HEROES } from "../../data/heroes";

export const RANKS = ["DIVINE", "IMMORTAL"] as const;
export const MODES = [{ id: 22, name: "ALL_PICK_RANKED" }, { id: 23, name: "TURBO" }] as const;
export const RANK_GROUPS = ["DIVINE_IMMORTAL"] as const;
export const REFERENCE_POLICY = "stratz-ranked-assumed-di-v2";
export function shouldResetLatestMonth(referenceMonth: string, latestMonth: string,
  force: boolean, existingPolicies: string[]) {
  return referenceMonth === latestMonth && (force || existingPolicies.some(policy => policy !== REFERENCE_POLICY));
}
export const METRICS = ["cs", "dn", "kills", "deaths", "assists", "networth", "xp", "heroDamage", "towerDamage", "healingAllies", "campsStacked", "neutrals", "ancients", "teamKills"] as const;
export type Metric = typeof METRICS[number];
export type Means = Record<Metric, number>;

const DAY = 86_400_000;
const WEEK = 7 * DAY;
export function monthStart(when: Date) {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
}
export function previousMonth(when: Date) {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() - 1, 1));
}
export function monthKey(month: Date) { return month.toISOString().slice(0, 7).replace("-", "_"); }
export function monthDate(month: Date) { return month.toISOString().slice(0, 10); }
export function weekStartsInMonth(month: Date) {
  const start = monthStart(month).getTime();
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)).getTime();
  // STRATZ week numbers are Unix epoch / 604800 (Thursday 00:00 UTC).
  const first = Math.ceil(start / WEEK) * WEEK;
  return Array.from({ length: Math.max(0, Math.ceil((end - first) / WEEK)) }, (_, i) => first + i * WEEK);
}
export function monthIsSettled(month: Date, now: Date) {
  const weeks = weekStartsInMonth(month);
  return weeks.length > 0 && now.getTime() >= weeks.at(-1)! + WEEK + 2 * DAY;
}
// Keep each response well under STRATZ_MAX_RESPONSE_BYTES (2 MiB by default).
export const HERO_CHUNKS = Array.from({ length: Math.ceil(HEROES.length / 4) }, (_, i) => HEROES.slice(i * 4, i * 4 + 4).map(hero => hero.id));
export function performanceJobs(month: Date) {
  return weekStartsInMonth(month).flatMap(week => RANK_GROUPS.flatMap(rank => HERO_CHUNKS.map(heroIds => ({ week, rank, heroIds }))));
}

export function weightedMean(current: number, currentCount: number, next: number, nextCount: number) {
  if (!Number.isFinite(current) || !Number.isFinite(next) || currentCount < 0 || nextCount <= 0) throw new Error("Invalid reference mean");
  return (current * currentCount + next * nextCount) / (currentCount + nextCount);
}

export function readMeans(value: Record<string, unknown>): Means {
  return Object.fromEntries(METRICS.map(metric => {
    // A missing STRATZ metric must never silently become a zero performance baseline.
    const raw = value[metric];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) throw new Error(`Invalid STRATZ metric ${metric}`);
    return [metric, raw];
  })) as Means;
}
