import type { MatchAnalysis, MatchPlayerAnalysis } from "../types";
import { calculatePerformanceScoreOrNull, performanceTone } from "./performance-score";
import { recalculateLanePosition } from "./lane-efficiency";

const POSITION_LABELS = ["", "Carry", "Mid", "Offlane", "Soft Support", "Hard Support"];

export function buildPositionSwapUpdates(
  players: MatchPlayerAnalysis[],
  playerSlot: number,
  targetPosition: number,
) {
  const player = players.find((entry) => entry.playerSlot === playerSlot);
  if (!player || player.position === targetPosition || targetPosition < 1 || targetPosition > 5) {
    return {};
  }

  const updates: Record<string, number> = { [String(playerSlot)]: targetPosition };
  const occupied = players.find((entry) =>
    entry.team === player.team
    && entry.playerSlot !== player.playerSlot
    && entry.position === targetPosition
  );

  if (occupied && player.position !== null) {
    updates[String(occupied.playerSlot)] = player.position;
  }
  return updates;
}

export function applyAnalysisPositionOverrides(
  analysis: MatchAnalysis,
  updates: Record<string, number>,
): MatchAnalysis {
  const players = analysis.players.map((entry) => {
    const position = updates[String(entry.playerSlot)];
    if (!Number.isInteger(position) || position < 1 || position > 5 || position === entry.position) return entry;
    const laneEfficiency = entry.laneEfficiency?.version === 2 ? recalculateLanePosition(entry.laneEfficiency, position) : undefined;
    const scoreMetrics = (entry.scoreMetrics ?? entry.benchmarks).filter(metric => metric.key !== "lane_score" && metric.key !== "lane_efficiency_pct");
    if (laneEfficiency?.score != null) scoreMetrics.push({ key: "lane_score", label: "Lane Efficiency", value: laneEfficiency.score,
      formattedValue: String(laneEfficiency.score), percentile: laneEfficiency.score, qualityPercentile: laneEfficiency.score,
      tone: performanceTone(laneEfficiency.score), source: "cohort", scoreOnly: true, scoreWeight: .9 * laneEfficiency.covered / 100 });
    return {
      ...entry,
      laneEfficiency,
      scoreMetrics,
      laneImpact: entry.laneImpact ? { ...entry.laneImpact, laneEfficiency: laneEfficiency?.score ?? null } : undefined,
      position,
      positionLabel: POSITION_LABELS[position],
      positionResolution: {
        assignedPosition: entry.positionResolution?.assignedPosition ?? null,
        detectedPosition: position,
        confirmedPosition: position,
        confidence: 100,
        source: "manual" as const,
        roleSwapDetected: false,
        swapWithPlayerSlot: null,
        evidence: entry.positionResolution?.evidence,
      },
    };
  }).map((entry) => {
    const score=calculatePerformanceScoreOrNull((entry.scoreMetrics??entry.benchmarks).filter((metric)=>metric.source!=="match"),analysis.durationMinutes,entry.position);
    return{...entry,...(score===null?{performanceScore:undefined}:{performanceScore:score})};
  });

  return { ...analysis, players };
}
