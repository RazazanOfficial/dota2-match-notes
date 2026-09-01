import type { MatchBenchmarkMetric, PerformanceTone } from "../types";

const BASE_WEIGHTS: Record<string, number> = {
  gold_per_min: 1,
  xp_per_min: 0.9,
  kills_per_min: 0.86,
  deaths_per_min: 0.92,
  assists_per_min: 0.76,
  last_hits_per_min: 0.82,
  denies_per_min: 0.38,
  hero_damage_per_min: 0.9,
  hero_healing_per_min: 0.34,
  tower_damage: 0.58,
};

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

export function calculatePerformanceScore(metrics: MatchBenchmarkMetric[], durationMinutes: number) {
  const scored = metrics.map((metric) => ({
    percentile: metric.qualityPercentile,
    weight: metric.scoreWeight ?? metricScoreWeight(metric, durationMinutes),
  })).filter((entry) => Number.isFinite(entry.percentile) && entry.weight > 0);
  const totalWeight = scored.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(scored.reduce((sum, entry) => sum + entry.percentile * entry.weight, 0) / totalWeight);
}
