import { useMemo, useSyncExternalStore } from "react";
import { useTaskManager } from "./components/TaskCenter";
import type { HistoryMatch } from "./history";
import type { AnalysisTask } from "./taskManager";
export function projectMatch(
  match: HistoryMatch,
  task: AnalysisTask | undefined,
): HistoryMatch {
  if (!task) return match;
  const rowVersion =
    Date.parse(
      match.analysisUpdatedAt ||
        match.analysisPreparation?.progress?.updatedAt ||
        "",
    ) || 0;
  const taskVersion = Date.parse(task.updatedAt || task.requestedAt) || 0;
  if (rowVersion > taskVersion) return match;
  const ready = task.status === "completed";
  return {
    ...match,
    analyzed: ready,
    analysisStatus: ready
      ? "ready"
      : task.status === "failed"
        ? "failed"
        : task.status === "processing"
          ? "processing"
          : "pending",
    analysisRequestedAt: task.requestedAt,
    analysisUpdatedAt: task.updatedAt,
    analysisPreparation: ready
      ? null
      : {
          replay: task.status,
          errorCode: task.progress.errorCode,
          progress: task.progress,
        },
  };
}
const idle = () => () => {};
const empty = () => undefined;
export function useLiveMatch(match: HistoryMatch, live: boolean) {
  const manager = useTaskManager();
  const task = useSyncExternalStore(
    manager?.subscribe || idle,
    manager
      ? () => manager.snapshot().analysis.find((t) => t.matchId === match.id)
      : empty,
    empty,
  );
  return useMemo(
    () => (live ? projectMatch(match, task) : match),
    [match, task, live],
  );
}
