type RecordValue = Record<string, unknown>;

const SLOTS = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];

// Fields that originate in the replay. Match identity, hero, account, result,
// position, and OpenDota benchmark metadata must stay with the match summary.
// Purchase logs and objectives differ between the raw parser and OpenDota's
// enriched response; keep OpenDota's version until separately reconciled.
export const REPLAY_PLAYER_FIELDS = [
  "times", "gold_t", "lh_t", "dn_t", "xp_t", "networth_t",
  "camps_stacked_t", "hero_damage_t", "hero_healing_t",
  "obs_placed", "sen_placed", "creeps_stacked", "camps_stacked",
  "rune_pickups", "firstblood_claimed", "teamfight_participation",
  "towers_killed", "roshans_killed", "observers_placed", "stuns",
  "obs_log", "sen_log", "obs_left_log", "sen_left_log",
  "kills_log", "deaths_log", "buyback_log", "runes_log", "connection_log",
  "lane_pos", "obs", "sen", "actions", "purchase", "gold_reasons",
  "xp_reasons", "killed", "item_uses", "ability_uses", "ability_targets",
  "damage_targets", "hero_hits", "damage", "damage_taken",
  "damage_inflictor", "runes", "killed_by", "kill_streaks",
  "multi_kills", "life_state", "healing", "damage_inflictor_received",
  "neutral_tokens_log", "neutral_item_history", "max_hero_hit",
] as const;

const MATCH_FIELDS = [
  "teamfights", "pauses", "chat", "radiant_gold_adv",
  "radiant_xp_adv", "draft_timings",
] as const;
const TIMELINES = [
  "gold_t", "lh_t", "dn_t", "xp_t", "networth_t",
  "camps_stacked_t", "hero_damage_t", "hero_healing_t",
] as const;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue : null;
}

function validTimeline(value: unknown, count: number) {
  return Array.isArray(value) && value.length === count &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

export function validateReplayBlob(input: unknown, expectedMatchId: number) {
  const blob = record(input);
  if (!blob || blob.match_id !== expectedMatchId || typeof blob.version !== "number" ||
    !Number.isInteger(blob.version) || blob.version < 1 ||
    !Array.isArray(blob.players) || blob.players.length !== 10) {
    throw new Error("Replay identity, version or player count is invalid");
  }
  const slots = new Set<number>();
  for (const entry of blob.players) {
    const player = record(entry);
    const slot = player?.player_slot;
    if (!player || typeof slot !== "number" || !SLOTS.includes(slot) || slots.has(slot)) {
      throw new Error("Replay player slots do not match a complete Dota match");
    }
    slots.add(slot);
    const times = player.times;
    if (!Array.isArray(times) || times.length < 2 || times.length > 300 ||
      times[0] !== 0 || !times.every((time, index) =>
        typeof time === "number" && Number.isInteger(time) &&
        (index === 0 || time > times[index - 1]))) {
      throw new Error(`Invalid replay timeline for player slot ${slot}`);
    }
    for (const field of TIMELINES) {
      if (!validTimeline(player[field], times.length)) {
        throw new Error(`Missing or invalid replay ${field} for player slot ${slot}`);
      }
    }
  }
  return blob;
}

export function overlayReplayData(
  openDota: RecordValue,
  replayInput: unknown,
): { match: RecordValue; source: "local" | "opendota" } {
  const matchId = openDota.match_id;
  if (typeof matchId !== "number" || !Number.isSafeInteger(matchId)) {
    return { match: openDota, source: "opendota" };
  }
  let replay: RecordValue;
  try {
    replay = validateReplayBlob(replayInput, matchId);
  } catch {
    return { match: openDota, source: "opendota" };
  }
  const openPlayers = Array.isArray(openDota.players) ? openDota.players : [];
  const sourcePlayers = new Map((replay.players as unknown[]).map((value) => {
    const player = record(value)!;
    return [player.player_slot as number, player] as const;
  }));
  // A mismatched roster means the parser payload must never partially replace
  // the summary, even if the match ID looks correct.
  const present = new Set(openPlayers.map((value) => record(value)?.player_slot));
  if (SLOTS.some((slot) => !present.has(slot))) {
    return { match: openDota, source: "opendota" };
  }
  const players = openPlayers.map((value) => {
    const original = record(value);
    if (!original) return value;
    const parsed = sourcePlayers.get(original.player_slot as number);
    if (!parsed) return value;
    const additions: RecordValue = {};
    for (const key of REPLAY_PLAYER_FIELDS) {
      if (parsed[key] !== undefined && parsed[key] !== null) additions[key] = parsed[key];
    }
    // The raw parser's purchase_log is not identical to OpenDota's enriched
    // log in the reference replay. Use it only when OpenDota has no log.
    if (!Array.isArray(original.purchase_log) && Array.isArray(parsed.purchase_log)) {
      additions.purchase_log = parsed.purchase_log;
    }
    return { ...original, ...additions };
  });
  const additions: RecordValue = {};
  for (const key of MATCH_FIELDS) {
    if (replay[key] !== undefined && replay[key] !== null) additions[key] = replay[key];
  }
  if (!Array.isArray(openDota.objectives) && Array.isArray(replay.objectives)) {
    additions.objectives = replay.objectives;
  }
  return { match: { ...openDota, ...additions, players, version: replay.version }, source: "local" };
}
