import type { MatchBenchmarkMetric, MatchPlayerAnalysis } from "../types";

export type MetricTotal = { value: number; unit: string };

export function benchmarkMetricTotal(
  entry: MatchBenchmarkMetric,
  player: MatchPlayerAnalysis,
  durationMinutes: number,
): MetricTotal | null {
  const estimatedTotal = () => Math.max(0, Math.round(entry.value * Math.max(1, durationMinutes)));
  const totals: Record<string, { value: number | null | undefined; fallback: () => number; unit: string }> = {
    kills_per_min: { value: player.kills, fallback: estimatedTotal, unit: "Kill" },
    deaths_per_min: { value: player.deaths, fallback: estimatedTotal, unit: "Death" },
    assists_per_min: { value: player.assists, fallback: estimatedTotal, unit: "Assist" },
    last_hits_per_min: { value: player.lastHits, fallback: estimatedTotal, unit: "LH" },
    hero_damage_per_min: { value: player.heroDamage, fallback: estimatedTotal, unit: "Hero DMG" },
    hero_healing_per_min: { value: player.heroHealing, fallback: estimatedTotal, unit: "Heal" },
    tower_damage: {
      value: player.towerDamage,
      fallback: () => Math.max(0, Math.round(entry.value)),
      unit: "Tower DMG",
    },
  };
  const total = totals[entry.key];
  if (!total) return null;
  return {
    value: typeof total.value === "number" ? total.value : total.fallback(),
    unit: total.unit,
  };
}

export function formatBenchmarkMetricTotal(total: MetricTotal) {
  const formatted = total.value >= 1_000
    ? `${(total.value / 1_000).toFixed(1).replace(/\.0$/g, "")}k`
    : new Intl.NumberFormat("en-US").format(total.value);
  return `${formatted} ${total.unit}`;
}
