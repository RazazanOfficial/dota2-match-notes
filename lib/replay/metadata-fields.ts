/** Store replay metadata as one validated unit, never as an early partial response. */
export function normalizedReplayRaw<T extends Record<string, unknown>>(match: T, matchId: number): T {
  const raw: Record<string, unknown> = { ...match };
  const numeric = (value: unknown) => (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value))
    ? Number(value) : NaN;
  const cluster = numeric(raw.cluster);
  const salt = numeric(raw.replay_salt);
  const suppliedUrl = raw.replay_url;
  delete raw.cluster;
  delete raw.replay_salt;
  delete raw.replay_url;
  if (raw.match_id !== matchId || !Number.isSafeInteger(cluster) || cluster <= 0 || cluster > 9_999 ||
      !Number.isSafeInteger(salt) || salt <= 0) return raw as T;
  const canonical = `http://replay${cluster}.valve.net/570/${matchId}_${salt}.dem.bz2`;
  if (suppliedUrl != null && suppliedUrl !== "") {
    try {
      const url = new URL(String(suppliedUrl));
      if (!["http:", "https:"].includes(url.protocol) || url.hostname !== `replay${cluster}.valve.net` ||
          url.pathname !== `/570/${matchId}_${salt}.dem.bz2` || url.port || url.username || url.password ||
          url.search || url.hash) return raw as T;
    } catch { return raw as T; }
  }
  return { ...raw, cluster, replay_salt: salt, replay_url: canonical } as unknown as T;
}

export function hasCompleteReplayMetadata(raw: Record<string, unknown> | null | undefined, matchId: number) {
  if (!raw) return false;
  const normalized = normalizedReplayRaw(raw, matchId);
  return normalized.replay_url !== undefined && typeof raw.replay_url === "string" &&
    normalized.cluster === raw.cluster && normalized.replay_salt === raw.replay_salt;
}

export function preserveVerifiedReplayRaw<T extends Record<string, unknown>>(
  match: T, existing: Record<string, unknown> | null | undefined, matchId: number,
): T {
  const fresh = normalizedReplayRaw(match, matchId);
  if (hasCompleteReplayMetadata(fresh, matchId) || !hasCompleteReplayMetadata(existing, matchId)) return fresh;
  const previous = normalizedReplayRaw(existing!, matchId);
  return { ...fresh, cluster: previous.cluster, replay_salt: previous.replay_salt,
    replay_url: previous.replay_url } as unknown as T;
}
