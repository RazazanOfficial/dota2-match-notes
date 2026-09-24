import type { MatchPositionEvidence, MatchPositionResolution } from "../types";

type Raw = Record<string, unknown>;
type Lane = "safe" | "mid" | "off";

interface PositionCandidate {
  slot: number;
  scores: Record<number, number>;
  evidence: MatchPositionEvidence[];
  source: MatchPositionResolution["source"];
  preferred: number | null;
}

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const rec = (value: unknown): Raw | null => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : null;
const atMinute = (value: unknown, minute: number) => Array.isArray(value) && value.length > minute ? num(value[minute]) : null;

// OpenDota's parser aggregates lane_pos only over the first ten minutes.
// The keys are map grid coordinates; ignore the fountain and jungle so early
// walking paths do not count as occupying a lane.
function replayLane(value: unknown, slot: number): Lane | null {
  const positions = rec(value);
  if (!positions) return null;
  let mid = 0, top = 0, bottom = 0;
  for (const [rawX, row] of Object.entries(positions)) {
    const x = Number(rawX);
    if (!Number.isInteger(x) || x < 0 || x > 255) continue;
    for (const [rawY, rawCount] of Object.entries(rec(row) ?? {})) {
      const y = Number(rawY), count = num(rawCount);
      if (!Number.isInteger(y) || y < 0 || y > 255 || count === null || count <= 0) continue;
      if (x >= 90 && x <= 165 && y >= 90 && y <= 165 && Math.abs(x - y) <= 20) mid += count;
      else if (y - x >= 25) top += count;
      else if (x - y >= 25) bottom += count;
    }
  }
  const total = mid + top + bottom;
  if (total < 60) return null;
  if (mid / total >= 0.6) return "mid";
  const side = slot < 128 ? bottom : top;
  const off = slot < 128 ? top : bottom;
  if (side / total >= 0.6) return "safe";
  if (off / total >= 0.6) return "off";
  return null;
}

function earlyWardCount(player: Raw) {
  return ["obs_log", "sen_log"].reduce((total, key) => total +
    (Array.isArray(player[key]) ? player[key].filter((entry: unknown) => {
      const time = num(rec(entry)?.time);
      return time !== null && time >= 0 && time <= 600;
    }).length : 0), 0);
}

function evidence(player: Raw, manualPosition: number | null): PositionCandidate | null {
  const slot = num(player.player_slot);
  if (slot === null) return null;
  const items: MatchPositionEvidence[] = [];
  const scores: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const add = (key: string, label: string, weight: number, supports: number[]) => {
    items.push({ key, label, weight, supports });
    supports.forEach((position) => { scores[position] += weight; });
  };
  if (manualPosition !== null && Number.isInteger(manualPosition) && manualPosition >= 1 && manualPosition <= 5) {
    add("manual", "Position توسط کاربر تأیید شده", 100, [manualPosition]);
    return { slot, scores, evidence: items, source: "manual", preferred: manualPosition };
  }

  const openPosition = num(player.position_est);
  const validOpenPosition = openPosition !== null && Number.isInteger(openPosition) && openPosition >= 1 && openPosition <= 5;
  if (validOpenPosition) {
    add("opendota-position", "Position تخمینی OpenDota", 58, [openPosition]);
  }
  const lane = replayLane(player.lane_pos, slot);
  if (lane === "mid") add("replay-mid", "Mid در ده دقیقه اول Replay", 110, [2]);
  if (lane === "safe") add("replay-safe", "Safe Lane در ده دقیقه اول Replay", 95, [1, 5]);
  if (lane === "off") add("replay-off", "Off Lane در ده دقیقه اول Replay", 95, [3, 4]);
  if (!lane) {
    const laneRole = num(player.lane_role);
    if (laneRole === 1) add("safe-lane", "Safe Lane در Laning Stage", 22, [1, 5]);
    if (laneRole === 2) add("mid-lane", "Mid Lane در Laning Stage", 32, [2]);
    if (laneRole === 3) add("off-lane", "Off Lane در Laning Stage", 22, [3, 4]);
  }
  if (player.is_roaming === true) add("roaming", "Roaming ثبت‌شده", 12, [4]);
  const lh10 = atMinute(player.lh_t, 10);
  if (lh10 !== null) {
    if (lh10 >= 30) add("farm-core", "LH@10 متناسب Core", 27, [1, 2, 3]);
    else if (lh10 <= 12) add("farm-support", "LH@10 پایین", 24, [4, 5]);
  }
  const wards = earlyWardCount(player);
  if (wards >= 2) add("early-vision", "Ward در ده دقیقه اول", 12, [4, 5]);
  const preferred = Object.entries(scores).sort((left, right) => right[1] - left[1])[0];
  return { slot, scores, evidence: items, source: validOpenPosition ? "opendota" : "heuristic", preferred: preferred && preferred[1] > 0 ? Number(preferred[0]) : null };
}

function permutations(values: number[]): number[][] {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail]));
}

function resolveTeam(candidates: PositionCandidate[]) {
  const resolved = new Map<number, { position: number | null; candidate: PositionCandidate; confidence: number }>();
  const fixed = candidates.filter((candidate) => candidate.source === "manual");
  const open = candidates.filter((candidate) => candidate.source !== "manual");
  fixed.forEach((candidate) => resolved.set(candidate.slot, { position: candidate.preferred, candidate, confidence: 100 }));
  const used = new Set(fixed.flatMap((candidate) => candidate.preferred ? [candidate.preferred] : []));
  const available = [1, 2, 3, 4, 5].filter((position) => !used.has(position));
  const pool = available.length >= open.length ? available : [1, 2, 3, 4, 5];
  let best: number[] = [], bestScore = -Infinity;
  for (const assignment of permutations(pool)) {
    const score = assignment.reduce((sum, position, index) => sum + (open[index]?.scores[position] ?? 0), 0);
    if (score > bestScore) { bestScore = score; best = assignment; }
  }
  open.forEach((candidate, index) => {
    const chosen = best[index];
    const score = chosen === undefined ? 0 : candidate.scores[chosen];
    const alternatives = available.filter((position) => position !== chosen).map((position) => candidate.scores[position]);
    const margin = score - Math.max(0, ...alternatives);
    // The team assignment is a constraint, not independent proof that an
    // otherwise unidentifiable player occupies the last free position.
    const reliable = score > 0 && margin >= 8;
    const position = reliable ? chosen : null;
    const base = candidate.source === "opendota" ? 68 : 48;
    resolved.set(candidate.slot, { position, candidate, confidence: reliable ? Math.min(86, Math.round(base + Math.min(18, margin / 2))) : 0 });
  });
  return resolved;
}

export function resolveMatchPositions(params: {
  players: Raw[];
  positionOverrides?: Record<string, number> | null;
  profileSlot: number | null;
  profileAssignedPosition: number | null;
}) {
  const candidates = params.players.flatMap((player) => {
    const slot = num(player.player_slot);
    if (slot === null) return [];
    const candidate = evidence(player, params.positionOverrides?.[String(slot)] ?? null);
    return candidate ? [candidate] : [];
  });
  const results = new Map<number, MatchPositionResolution>();
  for (const team of [candidates.filter((item) => item.slot < 128), candidates.filter((item) => item.slot >= 128)]) {
    for (const [slot, item] of resolveTeam(team)) {
      results.set(slot, {
        assignedPosition: null,
        detectedPosition: item.position,
        confirmedPosition: item.candidate.source === "manual" ? item.position : null,
        confidence: item.confidence,
        source: item.position === null ? "unknown" : item.candidate.source,
        roleSwapDetected: false,
        swapWithPlayerSlot: null,
        evidence: item.candidate.evidence,
      });
    }
  }
  const profile = params.profileSlot === null ? null : results.get(params.profileSlot);
  if (profile && params.profileAssignedPosition) {
    profile.assignedPosition = params.profileAssignedPosition;
    profile.roleSwapDetected = profile.source !== "manual" && profile.detectedPosition !== null && profile.detectedPosition !== params.profileAssignedPosition;
    if (profile.roleSwapDetected) {
      const sameTeam = [...results.entries()].filter(([slot]) => (slot < 128) === (params.profileSlot! < 128));
      const partner = sameTeam.find(([slot, value]) => slot !== params.profileSlot && value.source !== "manual" && value.detectedPosition === params.profileAssignedPosition);
      if (partner && profile.detectedPosition) {
        profile.swapWithPlayerSlot = partner[0];
        partner[1].assignedPosition = profile.detectedPosition;
        partner[1].roleSwapDetected = true;
        partner[1].swapWithPlayerSlot = params.profileSlot;
      }
    }
  }
  return results;
}
