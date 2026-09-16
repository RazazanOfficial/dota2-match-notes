import { describe, expect, it } from "vitest";
import { benchmarkMetricTotal, formatBenchmarkMetricTotal } from "../lib/dota/performance-presentation";
import type { MatchBenchmarkMetric, MatchPlayerAnalysis } from "../lib/types";

const player = {
  kills: 9,
  deaths: 3,
  assists: 15,
  lastHits: undefined,
  heroDamage: undefined,
  heroHealing: undefined,
  towerDamage: undefined,
} as unknown as MatchPlayerAnalysis;

function metric(key: string, value: number): MatchBenchmarkMetric {
  return { key, value, formattedValue: String(value), label: key, shortLabel: key, description: key, direction: "higher", percentile: 0.5, qualityPercentile: 50, tone: "steady", source: "cohort" };
}

describe("benchmark totals", () => {
  it("shows explicit K/D/A totals and derives missing LH, damage and healing totals", () => {
    expect(benchmarkMetricTotal(metric("kills_per_min", 0.18), player, 51)).toEqual({ value: 9, unit: "Kill" });
    expect(benchmarkMetricTotal(metric("deaths_per_min", 0.06), player, 51)).toEqual({ value: 3, unit: "Death" });
    expect(benchmarkMetricTotal(metric("assists_per_min", 0.29), player, 51)).toEqual({ value: 15, unit: "Assist" });
    expect(benchmarkMetricTotal(metric("last_hits_per_min", 6.55), player, 51)).toEqual({ value: 334, unit: "LH" });
    expect(benchmarkMetricTotal(metric("hero_damage_per_min", 534), player, 51)).toEqual({ value: 27_234, unit: "Hero DMG" });
    expect(benchmarkMetricTotal(metric("hero_healing_per_min", 0), player, 51)).toEqual({ value: 0, unit: "Heal" });
  });

  it("keeps Tower Damage as a total and formats large totals compactly", () => {
    const total = benchmarkMetricTotal(metric("tower_damage", 3_080), player, 51);
    expect(total).toEqual({ value: 3_080, unit: "Tower DMG" });
    expect(total && formatBenchmarkMetricTotal(total)).toBe("3.1k Tower DMG");
    expect(formatBenchmarkMetricTotal({ value: 10_500, unit: "Heal" })).toBe("10.5k Heal");
  });
});
