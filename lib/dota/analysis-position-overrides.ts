import type { MatchAnalysis, MatchPlayerAnalysis } from "../types";
import { calculatePerformanceScore } from "./performance-score";

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
    if (position === undefined) return entry;
    return {
      ...entry,
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
  }).map((entry) => ({
    ...entry,
    performanceScore: calculatePerformanceScore(
      entry.benchmarks,
      analysis.durationMinutes,
      entry.position,
    ),
  }));

  return { ...analysis, players };
}
