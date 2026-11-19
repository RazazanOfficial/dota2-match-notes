export const LANE_WEIGHTS: Record<number, Record<LaneKey, number>> = {
  1: { lh: 26, deaths: 23, networth: 26, dn: 5, kills: 10, assists: 7, ward: 1, resources: 2 },
  2: { lh: 24, deaths: 24, networth: 24, dn: 7, kills: 13, assists: 6, ward: 1, resources: 1 },
  3: { lh: 25, deaths: 22, networth: 23, dn: 7, kills: 12, assists: 8, ward: 1, resources: 2 },
  4: { lh: 5, deaths: 20, networth: 3, dn: 3, kills: 7, assists: 12, ward: 25, resources: 25 },
  5: { lh: 5, deaths: 20, networth: 3, dn: 3, kills: 5, assists: 12, ward: 27, resources: 25 },
};
export type LaneKey = "lh" | "deaths" | "networth" | "dn" | "kills" | "assists" | "ward" | "resources";
export type LaneMean = Record<"cs" | "deaths" | "networth" | "dn" | "kills" | "assists", number>;
export interface LaneReferenceRow extends LaneMean { heroId?: number; position: number; sampleCount: number }
export interface LaneReference {
  month: string; versionId: string;
  hero: LaneReferenceRow[];
  position: LaneReferenceRow[];
}
export interface LaneEvents {
  version: number;
  snapshotAt?: number;
  coordinateSystem?: string;
  snapshots: Array<{ slot: number; heroId: number; time: number; kills: number; deaths: number; assists: number; lh: number; dn: number; networth: number }>;
  purchases: Array<{ slot: number | null; time: number; item: string; charges: number | null }>;
  wards: Array<{ slot: number | null; type: string; time: number; handle: number | null; attackerSlot: number | null }>;
  combat: Array<{ time: number; targetSlot: number | null; attackerSlot: number | null; actorLocation?: LaneLocation | null; targetLocation?: LaneLocation | null }>;
  assists?: Array<{ slot: number; targetSlot: number; time: number; actorLocation?: LaneLocation | null; targetLocation?: LaneLocation | null }>;
  unresolvedAssistChanges?: number;
}
export interface LaneLocation { x: number; y: number; sampledAt: number; source: "interval" }
export type LaneReason = "unsupported-mode" | "unknown-position" | "short-match" | "legacy-events" | "missing-replay" | "missing-snapshot" | "missing-events" | "missing-reference" | "invalid-reference";
export interface LanePart { key: LaneKey; label: string; value: number | null; maximum: number; actual: number | null; mean: number | null; reason?: LaneReason; note?: string }
export interface LaneBonusEvent { time: number; kind: "kill" | "assist" | "dust"; targetSlot: number | null; lane: "top" | "mid" | "bottom" | null; local: boolean; points: number; reason: "join" | "home-lane" | "unproven-location" | "detection-purchase" }
export interface LaneEfficiencyResult {
  version: 2; windowSeconds: 600; status: "ready" | "partial" | "unavailable";
  score: number | null; subtotal: number; covered: number; bonus: number;
  normalized: number | null;
  referenceMonth: string | null; referenceVersion: string | null;
  cohort: "hero-position" | "position" | "unavailable"; samples: number | null;
  parts: LanePart[]; notes: string[];
  context: { slot: number; position: number | null; eligible: boolean; unavailableReason?: LaneReason; references: Array<{ position: number; cohort: LaneEfficiencyResult["cohort"]; mean: LaneReferenceRow | null }> };
  details: {
    ward: { points: number | null; placements: LaneEvents["wards"]; dewards: number; longevity: number; earlyPenalty: number } | null;
    resources: { points: number; restore: number; vision: number; tools: number; purchases: LaneEvents["purchases"]; dust: number } | null;
    bonus: { events: LaneBonusEvent[]; unresolvedAssists: number; cap: number };
  };
}

const LABELS: Record<LaneKey, string> = { lh: "LH", deaths: "Death", networth: "Net Worth", dn: "Deny",
  kills: "Kill", assists: "Assist", ward: "Ward", resources: "Resources" };
const STAT: Record<string, keyof LaneMean> = { lh: "cs", deaths: "deaths", networth: "networth",
  dn: "dn", kills: "kills", assists: "assists" };
const RESTORE: Record<string, number> = { item_flask: 3, item_clarity: 1.5,
  item_enchanted_mango: .75, item_tango: 2.5, item_faerie_fire: .75 };
const VISION = new Set(["item_ward_observer", "item_ward_sentry", "item_ward_dispenser"]);
const INVIS_HEROES = new Set([32, 56, 62, 63, 88]); // Riki, Clinkz, Bounty Hunter, Weaver, Nyx
export const LANE_END = 600;
const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const homeLane = (position: number | null, slot: number) => position === 2 ? "mid"
  : position === 1 || position === 5 ? slot < 128 ? "bottom" : "top"
    : position === 3 || position === 4 ? slot < 128 ? "top" : "bottom" : null;

function partValue(key: LaneKey, actual: number | null, average: number | null, maximum: number, enabled: boolean) {
  return !enabled || !valid(actual) ? null : key === "ward" ? maximum * actual / 27
    : key === "resources" ? maximum * actual / 26 : !valid(average) || average <= 0 ? null
      : key === "deaths" ? maximum * clamp(1 - actual / (2 * average), 1) : maximum * clamp(actual / (2 * average), 1);
}

/** Reuse replay evidence and all five role references after an in-client role correction. */
export function recalculateLanePosition(result: LaneEfficiencyResult, position: number): LaneEfficiencyResult {
  const weights = LANE_WEIGHTS[position];
  if (!weights || !result.context) return result;
  const reference = result.context.references.find(row => row.position === position);
  const mean = reference?.mean;
  const parts = result.parts.map(part => {
    const maximum = weights[part.key];
    const average = STAT[part.key] ? mean?.[STAT[part.key]] ?? null : null;
    const value = partValue(part.key, part.actual, average, maximum, result.context.eligible);
    const reason = value !== null ? undefined : !result.context.eligible ? result.context.unavailableReason ?? part.reason : !valid(part.actual) ? "missing-events"
      : STAT[part.key] && !mean ? "missing-reference" : "invalid-reference";
    return { ...part, maximum, mean: valid(average) ? average : null, value, reason };
  });
  const events = result.details.bonus.events.map(event => {
    if (event.kind === "dust") return event;
    const joined = event.local && event.lane !== homeLane(position, result.context.slot);
    return { ...event, points: joined ? .5 : 0, reason: joined ? "join" as const : event.local ? "home-lane" as const : "unproven-location" as const };
  });
  const bonus = Math.min(1.5, events.reduce((sum, event) => sum + event.points, 0));
  const covered = parts.reduce((sum, part) => sum + (part.value === null ? 0 : part.maximum), 0);
  const subtotal = parts.reduce((sum, part) => sum + (part.value ?? 0), 0);
  const normalized = covered > 0 ? subtotal / covered * 100 : null;
  return { ...result, parts, covered, subtotal, normalized, bonus,
    context: { ...result.context, position }, cohort: reference?.cohort ?? "unavailable", samples: mean?.sampleCount ?? null,
    score: normalized === null ? null : Math.round(Math.min(100, normalized + bonus)),
    status: covered === 100 ? "ready" : covered > 0 ? "partial" : "unavailable",
    details: { ...result.details, bonus: { ...result.details.bonus, events } } };
}

// Conservative grid corridors: ambiguous jungle/river positions cannot prove a Join.
export function laneAtLocation(location: LaneLocation | null | undefined, time: number): LaneBonusEvent["lane"] {
  if (!location || location.source !== "interval" || !Number.isFinite(location.sampledAt) ||
    Math.abs(location.sampledAt - time) > 2) return null;
  const { x, y } = location;
  if (![x, y].every(v => Number.isFinite(v) && v >= 64 && v <= 192) || Math.abs(x + y - 256) <= 14) return null;
  if (x >= 90 && x <= 165 && y >= 90 && y <= 165 && Math.abs(x - y) <= 12) return "mid";
  if ((x <= 90 && y >= 110) || (y >= 166 && x <= 155)) return "top";
  if ((y <= 90 && x >= 110) || (x >= 166 && y <= 155)) return "bottom";
  return null;
}

function purchasePoints(events: LaneEvents, slot: number) {
  const purchases = events.purchases.filter(row => row.slot === slot && row.time <= LANE_END && row.time >= -300);
  let restore = 0, vision = 0, tools = 0;
  for (const row of purchases) {
    // The parser repeats the initial ward dispenser at -90 before listing the inventory at -89.
    if (row.time === -90 && row.item === "item_ward_dispenser" && purchases.some(other =>
      other.item === row.item && other.time === -89)) continue;
    // A dispenser is a wrapper for its observer/sentry components at the same purchase time.
    if (row.item === "item_ward_dispenser" && purchases.some(other =>
      other.time === row.time && other.item !== row.item && VISION.has(other.item))) continue;
    if (RESTORE[row.item]) restore += RESTORE[row.item] * (row.item === "item_tango" && valid(row.charges)
      ? Math.max(1, Math.ceil(row.charges / 3)) : 1);
    if (VISION.has(row.item)) vision += 2;
    if (row.item === "item_smoke_of_deceit") tools += 1.25;
  }
  return { points: Math.min(12, restore) + Math.min(12, vision) + Math.min(2, tools),
    restore: Math.min(12, restore), vision: Math.min(12, vision), tools: Math.min(2, tools), purchases,
    dust: purchases.filter(row => row.item === "item_dust").length };
}

function wardPoints(events: LaneEvents, slot: number, duration: number) {
  const placed = events.wards.filter(row => row.slot === slot && (row.type === "obs" || row.type === "sen") && row.time <= LANE_END);
  const observers = placed.filter(row => row.type === "obs"), sentries = placed.filter(row => row.type === "sen");
  const left = new Map(events.wards.filter(row => row.type.endsWith("_left") && row.handle !== null)
    .map(row => [row.handle, row]));
  let longevity = 0, earlyPenalty = 0, unknown = false;
  for (const [kind, rows, limit, award] of [["obs", observers, 2, 2], ["sen", sentries, 2, 1]] as const) {
    for (const placement of rows.slice(0, limit)) {
      if (placement.handle === null) { unknown = true; continue; }
      const end = left.get(placement.handle);
      const threshold = placement.time < 300 ? 210 : 270;
      if (!end && duration < placement.time + threshold) { unknown = true; continue; }
      const elapsed = (end?.time ?? duration) - placement.time;
      if (elapsed >= threshold) longevity += award;
      else if (kind === "obs" && end) earlyPenalty = Math.min(2, earlyPenalty + 1);
    }
  }
  let enemyObs = 0, enemySen = 0;
  for (const placement of events.wards.filter(row => (row.type === "obs" || row.type === "sen") &&
    row.slot !== null && (row.slot < 128) !== (slot < 128) && row.handle !== null)) {
    const end = left.get(placement.handle!);
    if (end?.attackerSlot !== slot || end.time > LANE_END) continue;
    // Expiry events can carry the owner's name; only an enemy attacker before natural expiry counts.
    if (end.time - placement.time >= (placement.type === "obs" ? 360 : 420)) continue;
    if (placement.type === "obs") enemyObs++;
    else enemySen++;
  }
  const first = (observers.length ? 4 : 0) + (sentries.length ? 3 : 0);
  const extra = Math.min(2, Math.max(0, observers.length - 1)) * 2 + Math.min(2, Math.max(0, sentries.length - 1));
  const deward = Math.min(2, enemyObs) * 2.5 + Math.min(3, enemySen);
  return { points: unknown ? null : clamp(first + extra + longevity + deward - earlyPenalty, 27),
    placements: placed, dewards: enemyObs + enemySen, longevity, earlyPenalty };
}

export function calculateLaneEfficiency(params: {
  slot: number; heroId: number; position: number | null; positions: Map<number, number | null>;
  heroIds: Map<number, number>; duration: number; reference?: LaneReference;
  requestedReferenceMonth?: string;
  events?: LaneEvents; gameMode: number | null; lobbyType: number | null;
}): LaneEfficiencyResult {
  const { slot, position, events, reference } = params;
  const weights = position === null ? null : LANE_WEIGHTS[position];
  const completeEvents = events?.version === 2 && events.snapshotAt === LANE_END && Array.isArray(events.snapshots) &&
    Array.isArray(events.purchases) && Array.isArray(events.wards) && Array.isArray(events.combat) ? events : undefined;
  const snapshot = params.duration >= LANE_END ? completeEvents?.snapshots.find(row => row.slot === slot && row.heroId === params.heroId && row.time === LANE_END) : undefined;
  const supportedMode = params.gameMode === 22 && params.lobbyType === 7;
  const unavailableReason: LaneReason | undefined = !supportedMode ? "unsupported-mode" : params.duration < LANE_END ? "short-match"
    : !events ? "missing-replay" : !completeEvents ? "legacy-events" : !snapshot ? "missing-snapshot" : undefined;
  const hero = reference?.hero.find(row => row.heroId === params.heroId && row.position === position);
  const mean = hero ?? reference?.position.find(row => row.position === position);
  const cohort = hero ? "hero-position" : mean ? "position" : "unavailable";
  const keys: LaneKey[] = ["lh", "deaths", "networth", "dn", "kills", "assists", "ward", "resources"];
  const resource = completeEvents && snapshot ? purchasePoints(completeEvents, slot) : null;
  const ward = completeEvents && snapshot ? wardPoints(completeEvents, slot, params.duration) : null;
  const parts = keys.map((key): LanePart => {
    const maximum = weights?.[key] ?? 0;
    const actual = key === "ward" ? ward?.points ?? null : key === "resources" ? resource?.points ?? null : snapshot?.[key] ?? null;
    const average = STAT[key] ? mean?.[STAT[key]] ?? null : null;
    const base = partValue(key, actual, average, maximum, !!weights && supportedMode);
    const reason: LaneReason | undefined = base !== null ? undefined : !supportedMode ? "unsupported-mode" : !weights ? "unknown-position"
      : params.duration < LANE_END ? "short-match" : !events ? "missing-replay" : !completeEvents ? "legacy-events"
        : !snapshot ? "missing-snapshot" : actual === null || !valid(actual) ? "missing-events"
          : !mean && STAT[key] ? "missing-reference" : "invalid-reference";
    return { key, label: LABELS[key], value: base, maximum, actual: valid(actual) ? actual : null,
      mean: valid(average) ? average : null, ...(reason ? { reason } : {}) };
  });
  const notes: string[] = [];
  if (reference && params.requestedReferenceMonth &&
      reference.month.slice(0, 7) !== params.requestedReferenceMonth.slice(0, 7)) {
    notes.push(`مرجع ${params.requestedReferenceMonth.slice(0, 7)} هنوز آماده نیست؛ این امتیاز موقتاً با مرجع ${reference.month.slice(0, 7)} محاسبه شده است.`);
  }
  if (!supportedMode) notes.push("فعلاً مقایسهٔ ماهانه فقط برای Ranked All Pick انجام می‌شود.");
  if (events && !snapshot) notes.push("Replay برای این بازیکن شمارندهٔ معتبر دقیقهٔ ۱۰ ندارد؛ Replay ذخیره‌شده باید دوباره پارس شود.");
  if (snapshot && supportedMode && (!Array.isArray(completeEvents?.assists) || completeEvents.unresolvedAssistChanges))
    notes.push("Bonus Assist فقط برای رویدادهای با حریف قابل انتساب محاسبه شده؛ بعضی مشارکت‌ها ممکن است قابل اثبات نباشند.");
  const bonusEvents: LaneBonusEvent[] = [];
  const addJoin = (kind: "kill" | "assist", event: { time: number; targetSlot: number | null; actorLocation?: LaneLocation | null; targetLocation?: LaneLocation | null }) => {
    if (!Number.isFinite(event.time) || event.time < 0 || event.time > LANE_END || event.targetSlot === null || (event.targetSlot < 128) === (slot < 128)) return;
    const lane = completeEvents?.coordinateSystem === "dota-grid" ? laneAtLocation(event.actorLocation, event.time) : null;
    const targetLane = completeEvents?.coordinateSystem === "dota-grid" ? laneAtLocation(event.targetLocation, event.time) : null;
    const local = lane !== null && targetLane === lane && !!event.actorLocation && !!event.targetLocation &&
      Math.hypot(event.actorLocation.x - event.targetLocation.x, event.actorLocation.y - event.targetLocation.y) <= 16;
    const home = homeLane(position, slot);
    const joined = local && home !== null && lane !== home;
    bonusEvents.push({ kind, time: event.time, targetSlot: event.targetSlot, lane, local, points: joined ? .5 : 0,
      reason: joined ? "join" : local && home ? "home-lane" : "unproven-location" });
  };
  if (snapshot && supportedMode) {
    for (const death of completeEvents!.combat) {
      if (death.attackerSlot !== slot || death.targetSlot === null ||
        (death.targetSlot < 128) === (slot < 128)) continue;
      addJoin("kill", death);
    }
    for (const assist of completeEvents!.assists ?? []) {
      if (assist.slot !== slot || (assist.targetSlot < 128) === (slot < 128)) continue;
      addJoin("assist", assist);
    }
    const invis = [...params.heroIds].some(([otherSlot, heroId]) =>
      (otherSlot < 128) !== (slot < 128) && INVIS_HEROES.has(heroId));
    if (invis && resource?.dust) bonusEvents.push({ kind: "dust", time: resource.purchases.find(p => p.item === "item_dust")!.time,
      targetSlot: null, lane: null, local: true, points: .5, reason: "detection-purchase" });
  }
  const bonus = Math.min(1.5, bonusEvents.reduce((sum, event) => sum + event.points, 0));
  const subtotal = parts.reduce((sum, part) => sum + (part.value ?? 0), 0);
  const covered = parts.reduce((sum, part) => sum + (part.value === null ? 0 : part.maximum), 0);
  const normalized = covered > 0 ? subtotal / covered * 100 : null;
  return { version: 2, windowSeconds: 600, status: covered === 100 ? "ready" : covered > 0 ? "partial" : "unavailable",
    score: normalized === null ? null : Math.round(Math.min(100, normalized + bonus)),
    subtotal, covered, normalized, bonus,
    referenceMonth: reference?.month ?? null, referenceVersion: reference?.versionId ?? null,
    cohort, samples: mean?.sampleCount ?? null, parts, notes,
    context: { slot, position, eligible: !!snapshot && supportedMode, unavailableReason, references: [1, 2, 3, 4, 5].map(role => {
      const heroMean = reference?.hero.find(row => row.heroId === params.heroId && row.position === role);
      const roleMean = heroMean ?? reference?.position.find(row => row.position === role);
      return { position: role, cohort: heroMean ? "hero-position" : roleMean ? "position" : "unavailable", mean: roleMean ?? null };
    }) },
    details: { ward, resources: resource, bonus: { events: bonusEvents, unresolvedAssists: completeEvents?.unresolvedAssistChanges ?? 0, cap: 1.5 } } };
}
