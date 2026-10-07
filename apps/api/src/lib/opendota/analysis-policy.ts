export const ANALYSIS_TOKEN_COST = 10;
export const REPLAY_WARNING_AFTER_DAYS = 10;
export const REPLAY_REQUEST_MAX_AGE_DAYS = 20;

const DAY_MS = 86_400_000;

export type ReplayAgeState = "fresh" | "warning" | "expired" | "unknown";
export type StoredParseStatus = "pending" | "processing" | "completed" | "failed" | null | undefined;

export function replayAgeInDays(startedAt: Date | string | null | undefined, now = new Date()) {
  if (!startedAt) return null;
  const started = startedAt instanceof Date ? startedAt : new Date(startedAt);
  if (Number.isNaN(started.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - started.getTime()) / DAY_MS));
}

export function replayAgeState(startedAt: Date | string | null | undefined, now = new Date()): ReplayAgeState {
  const age = replayAgeInDays(startedAt, now);
  if (age === null) return "unknown";
  if (age > REPLAY_REQUEST_MAX_AGE_DAYS) return "expired";
  if (age > REPLAY_WARNING_AFTER_DAYS) return "warning";
  return "fresh";
}

export function canRequestReplayAnalysis(startedAt: Date | string | null | undefined, now = new Date()) {
  return replayAgeState(startedAt, now) !== "expired";
}

export function matchAnalysisStatus(params: {
  replayParsed: boolean;
  parseStatus?: StoredParseStatus;
  startedAt?: Date | string | null;
  now?: Date;
}) {
  if (params.replayParsed) return "ready" as const;
  if (params.parseStatus === "pending" || params.parseStatus === "processing") return params.parseStatus;
  if (params.parseStatus === "failed") return "failed" as const;
  if (replayAgeState(params.startedAt, params.now) === "expired") return "expired" as const;
  return "basic" as const;
}
