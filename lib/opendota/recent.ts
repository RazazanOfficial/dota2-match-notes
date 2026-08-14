import type { OpenDotaRecentMatch } from "./validation";

export function selectRecentSyncMatches(
  matches: OpenDotaRecentMatch[],
  options: {
    maxNewMatches: number;
    since?: Date | null;
    lookbackSeconds?: number;
    initialMatches?: number;
  },
) {
  let eligible = matches;

  if (options.since) {
    const cutoff = Math.floor(
      (options.since.getTime() - (options.lookbackSeconds || 0) * 1_000) /
        1_000,
    );
    eligible = matches.filter((match) => match.start_time >= cutoff);
  } else if (options.initialMatches !== undefined) {
    eligible = matches.slice(0, options.initialMatches);
  }

  return {
    eligible,
    candidates: eligible
      .slice(0, options.maxNewMatches)
      .sort((left, right) => left.start_time - right.start_time),
    ignoredOlder: Math.max(0, matches.length - eligible.length),
  };
}
