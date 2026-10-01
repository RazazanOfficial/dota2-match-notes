export const LANE_WEIGHTS: Record<number, Record<LaneKey, number>> = {
  1: { lh: 28, deaths: 22, networth: 20, dn: 7, kills: 8, assists: 5, ward: 5, resources: 5 },
  2: { lh: 24, deaths: 23, networth: 17, dn: 13, kills: 14, assists: 6, ward: 2, resources: 1 },
  3: { lh: 25, deaths: 22, networth: 17, dn: 11, kills: 10, assists: 8, ward: 3, resources: 4 },
  4: { lh: 5, deaths: 20, networth: 3, dn: 4, kills: 6, assists: 12, ward: 25, resources: 25 },
  5: { lh: 5, deaths: 18, networth: 3, dn: 3, kills: 6, assists: 12, ward: 27, resources: 26 },
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
  snapshots: Array<{ slot: number; heroId: number; time: number; kills: number; deaths: number; assists: number; lh: number; dn: number; networth: number }>;
  purchases: Array<{ slot: number | null; time: number; item: string; charges: number | null }>;
  wards: Array<{ slot: number | null; type: string; time: number; handle: number | null; attackerSlot: number | null }>;
  combat: Array<{ time: number; targetSlot: number | null; attackerSlot: number | null }>;
  assists?: Array<{ slot: number; targetSlot: number; time: number }>;
  unresolvedAssistChanges?: number;
}
export interface LanePart { key: LaneKey; label: string; value: number | null; maximum: number; actual: number | null; mean: number | null; note?: string }
export interface LaneEfficiencyResult {
  score: number | null; subtotal: number; covered: number; bonus: number;
  referenceMonth: string | null; referenceVersion: string | null;
  cohort: "hero-position" | "position" | "unavailable"; samples: number | null;
  parts: LanePart[]; notes: string[];
}

const LABELS: Record<LaneKey, string> = { lh: "LH", deaths: "Death", networth: "Net Worth", dn: "Deny",
  kills: "Kill", assists: "Assist", ward: "Ward", resources: "Resources" };
const STAT: Record<string, keyof LaneMean> = { lh: "cs", deaths: "deaths", networth: "networth",
  dn: "dn", kills: "kills", assists: "assists" };
const RESTORE: Record<string, number> = { item_flask: 3, item_clarity: 1.5,
  item_enchanted_mango: .75, item_tango: 2.5, item_faerie_fire: .75 };
const VISION = new Set(["item_ward_observer", "item_ward_sentry", "item_ward_dispenser"]);
const INVIS_HEROES = new Set([32, 56, 62, 63, 88]); // Riki, Clinkz, Bounty Hunter, Weaver, Nyx
const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const laneOf = (position: number | null | undefined) => position === 1 || position === 5 ? 1
  : position === 2 ? 2 : position === 3 || position === 4 ? 3 : null;

function purchasePoints(events: LaneEvents, slot: number) {
  const purchases = events.purchases.filter(row => row.slot === slot && row.time <= 600 && row.time >= -300);
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
    dust: purchases.filter(row => row.item === "item_dust").length };
}

function wardPoints(events: LaneEvents, slot: number, duration: number) {
  const placed = events.wards.filter(row => row.slot === slot && (row.type === "obs" || row.type === "sen") && row.time <= 600);
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
    if (end?.attackerSlot !== slot || end.time > 600) continue;
    // Expiry events can carry the owner's name; only an enemy attacker before natural expiry counts.
    if (end.time - placement.time >= (placement.type === "obs" ? 360 : 420)) continue;
    if (placement.type === "obs") enemyObs++;
    else enemySen++;
  }
  const first = (observers.length ? 4 : 0) + (sentries.length ? 3 : 0);
  const extra = Math.min(2, Math.max(0, observers.length - 1)) * 2 + Math.min(2, Math.max(0, sentries.length - 1));
  const deward = Math.min(2, enemyObs) * 2.5 + Math.min(3, enemySen);
  return unknown ? null : clamp(first + extra + longevity + deward - earlyPenalty, 27);
}

export function calculateLaneEfficiency(params: {
  slot: number; heroId: number; position: number | null; positions: Map<number, number | null>;
  heroIds: Map<number, number>; duration: number; reference?: LaneReference;
  requestedReferenceMonth?: string;
  events?: LaneEvents; gameMode: number | null; lobbyType: number | null;
}): LaneEfficiencyResult {
  const { slot, position, events, reference } = params;
  const weights = position === null ? null : LANE_WEIGHTS[position];
  const completeEvents = events?.version === 1 && Array.isArray(events.snapshots) &&
    Array.isArray(events.purchases) && Array.isArray(events.wards) && Array.isArray(events.combat) ? events : undefined;
  const snapshot = completeEvents?.snapshots.find(row => row.slot === slot && row.heroId === params.heroId && row.time === 600);
  const supportedMode = params.gameMode === 22 && params.lobbyType === 7;
  const hero = reference?.hero.find(row => row.heroId === params.heroId && row.position === position);
  const mean = hero ?? reference?.position.find(row => row.position === position);
  const cohort = hero ? "hero-position" : mean ? "position" : "unavailable";
  const keys: LaneKey[] = ["lh", "deaths", "networth", "dn", "kills", "assists", "ward", "resources"];
  const resource = completeEvents && snapshot ? purchasePoints(completeEvents, slot) : null;
  const ward = completeEvents && snapshot ? wardPoints(completeEvents, slot, params.duration) : null;
  const parts = keys.map((key): LanePart => {
    const maximum = weights?.[key] ?? 0;
    const actual = key === "ward" ? ward : key === "resources" ? resource?.points ?? null : snapshot?.[key] ?? null;
    const average = STAT[key] ? mean?.[STAT[key]] ?? null : null;
    const base = !weights || !supportedMode || actual === null || !valid(actual) ? null
      : key === "ward" ? maximum * actual / 27
        : key === "resources" ? maximum * actual / 26
          : !valid(average) || average <= 0 ? null
            : key === "deaths" ? maximum * clamp(1 - actual / (2 * average), 1)
              : maximum * clamp(actual / (2 * average), 1);
    return { key, label: LABELS[key], value: base, maximum, actual,
      mean: average, ...(base === null ? { note: !supportedMode ? "این Mode مرجع Ranked ندارد" :
        !snapshot ? "شمارندهٔ دقیقهٔ ۱۰ Replay موجود نیست" : !mean && STAT[key] ? "مرجع ماه قبل موجود نیست" :
          actual === null ? "رویداد قابل‌اتکا ثبت نشده" : "میانگین معتبر موجود نیست" } : {}) };
  });
  const notes: string[] = [];
  if (reference && params.requestedReferenceMonth &&
      reference.month.slice(0, 7) !== params.requestedReferenceMonth.slice(0, 7)) {
    notes.push(`مرجع ${params.requestedReferenceMonth.slice(0, 7)} هنوز آماده نیست؛ این امتیاز موقتاً با مرجع ${reference.month.slice(0, 7)} محاسبه شده است.`);
  }
  if (!supportedMode) notes.push("فعلاً مقایسهٔ ماهانه فقط برای Ranked All Pick انجام می‌شود.");
  if (events && !snapshot) notes.push("Replay برای این بازیکن شمارندهٔ معتبر دقیقهٔ ۱۰ ندارد.");
  if (snapshot && supportedMode && (!Array.isArray(completeEvents?.assists) || completeEvents.unresolvedAssistChanges))
    notes.push("Bonus Assist فقط برای رویدادهای با حریف قابل انتساب محاسبه شده؛ بعضی مشارکت‌ها ممکن است قابل اثبات نباشند.");
  let bonuses = 0;
  if (snapshot && supportedMode) {
    for (const death of completeEvents!.combat) {
      if (death.attackerSlot !== slot || death.targetSlot === null ||
        (death.targetSlot < 128) === (slot < 128)) continue;
      const ownLane = laneOf(position), targetLane = laneOf(params.positions.get(death.targetSlot));
      if (ownLane !== null && targetLane !== null && ownLane !== targetLane) bonuses++;
    }
    for (const assist of completeEvents!.assists ?? []) {
      if (assist.slot !== slot || (assist.targetSlot < 128) === (slot < 128)) continue;
      const ownLane = laneOf(position), targetLane = laneOf(params.positions.get(assist.targetSlot));
      if (ownLane !== null && targetLane !== null && ownLane !== targetLane) bonuses++;
    }
    const invis = [...params.heroIds].some(([otherSlot, heroId]) =>
      (otherSlot < 128) !== (slot < 128) && INVIS_HEROES.has(heroId));
    if (invis && resource?.dust) bonuses++;
  }
  const bonus = Math.min(1.5, bonuses * .5);
  const subtotal = parts.reduce((sum, part) => sum + (part.value ?? 0), 0);
  return { score: parts.every(part => part.value !== null) ? Math.round(Math.min(100, subtotal + bonus)) : null,
    subtotal, covered: parts.reduce((sum, part) => sum + (part.value === null ? 0 : part.maximum), 0), bonus,
    referenceMonth: reference?.month ?? null, referenceVersion: reference?.versionId ?? null,
    cohort, samples: mean?.sampleCount ?? null, parts, notes };
}
