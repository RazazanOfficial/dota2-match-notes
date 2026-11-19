import { describe, expect, it } from "vitest";
import { calculateLaneEfficiency, recalculateLanePosition, LANE_WEIGHTS, type LaneEvents, type LaneReference } from "../src/lib/dota/lane-efficiency";
import { qualifiesHeroPosition } from "../src/lib/monthly-reference/service";
import firstMatch from "./fixtures/lane-9017352046.json";
import secondMatch from "./fixtures/lane-9017779833.json";

const reference: LaneReference = { month: "2026-08", versionId: "reference-v1", hero: [
  { heroId: 37, position: 5, sampleCount: 721, cs: 10, deaths: 2, networth: 2000, dn: 2, kills: 1, assists: 4 },
], position: [{ position: 5, sampleCount: 100000, cs: 15, deaths: 1, networth: 2500, dn: 3, kills: 2, assists: 3 }] };

const events: LaneEvents = {
  version: 2, snapshotAt: 600, coordinateSystem: "dota-grid",
  snapshots: [{ slot: 3, heroId: 37, time: 600, lh: 10, dn: 2, kills: 1, deaths: 0, assists: 4, networth: 2000 }],
  purchases: [
    { slot: 3, time: -90, item: "item_ward_dispenser", charges: null },
    { slot: 3, time: -89, item: "item_ward_dispenser", charges: 1 },
    { slot: 3, time: -89, item: "item_tango", charges: 6 },
    { slot: 3, time: -89, item: "item_flask", charges: 1 },
    { slot: 3, time: 30, item: "item_smoke_of_deceit", charges: null },
    { slot: 3, time: 120, item: "item_dust", charges: null },
  ],
  wards: [
    { slot: 3, type: "obs", time: 0, handle: 1, attackerSlot: null },
    { slot: 3, type: "obs_left", time: 210, handle: 1, attackerSlot: null },
    { slot: 3, type: "sen", time: 300, handle: 2, attackerSlot: null },
    { slot: 3, type: "sen_left", time: 570, handle: 2, attackerSlot: null },
    { slot: 128, type: "obs", time: 0, handle: 3, attackerSlot: null },
    { slot: 128, type: "obs_left", time: 120, handle: 3, attackerSlot: 3 },
  ],
  combat: [{ time: 280, attackerSlot: 3, targetSlot: 129, actorLocation: { x: 75, y: 140, sampledAt: 280, source: "interval" }, targetLocation: { x: 77, y: 140, sampledAt: 280, source: "interval" } }],
};
const base = { slot: 3, heroId: 37, position: 5, duration: 2500, gameMode: 22, lobbyType: 7,
  positions: new Map([[3, 5], [128, 3], [129, 2]]), heroIds: new Map([[3, 37], [128, 62], [129, 1]]),
  reference, events };

describe("Lane Efficiency contract", () => {
  it("rejects unversioned legacy snapshots even when their timestamp is 600", () => {
    for (const fixture of [firstMatch, secondMatch]) {
      const positions = new Map(Object.entries(fixture.positions).map(([slot, pos]) => [Number(slot), pos]));
      const heroIds = new Map(fixture.events.snapshots.map(row => [row.slot, row.heroId]));
      for (const snapshot of fixture.events.snapshots) {
        const mean = fixture.reference.hero.find(row => row.heroId === snapshot.heroId && row.position === positions.get(snapshot.slot));
        expect(mean, `missing hero mean for ${fixture.matchId}/${snapshot.slot}`).toBeDefined();
        expect(qualifiesHeroPosition(mean!.metaCount, mean!.metaCount / mean!.share, mean!.sampleCount)).toBe(true);
        const result = calculateLaneEfficiency({ slot: snapshot.slot, heroId: snapshot.heroId,
          position: positions.get(snapshot.slot) ?? null, positions, heroIds, duration: fixture.duration,
          reference: fixture.reference, events: fixture.events as LaneEvents, gameMode: 22, lobbyType: 7 });
        expect(result.score, `match ${fixture.matchId}, slot ${snapshot.slot}`).toBeNull();
        expect(result.notes.some(note => note.includes("دوباره پارس"))).toBe(true);
      }
    }
    const grimstroke = secondMatch.events.snapshots.find(row => row.slot === 129);
    expect(grimstroke?.kills).toBe(1); // The older kills_log had zero here.
  });
  it("accepts 1000 samples alone, or 500 with a 20% share; also checks minute-10 coverage", () => {
    expect(qualifiesHeroPosition(1000, 10000)).toBe(true);
    expect(qualifiesHeroPosition(500, 2500)).toBe(true);
    expect(qualifiesHeroPosition(999, 10000)).toBe(false);
    expect(qualifiesHeroPosition(500, 2501)).toBe(false);
    expect(qualifiesHeroPosition(1000, 10000, 499)).toBe(false);
    expect(qualifiesHeroPosition(1200, 15000, 700)).toBe(false);
    expect(qualifiesHeroPosition(1200, 15000, 1000)).toBe(true);
  });

  it("uses the requested per-position 100-point weights and a replay minute-10 scoreboard", () => {
    for (const weights of Object.values(LANE_WEIGHTS)) expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(100);
    expect(LANE_WEIGHTS[1]).toEqual({ lh: 26, deaths: 23, networth: 26, dn: 5, kills: 10, assists: 7, ward: 1, resources: 2 });
    expect(LANE_WEIGHTS[2]).toMatchObject({ ward: 1, deaths: 24, networth: 24, dn: 7, kills: 13 });
    expect(LANE_WEIGHTS[3]).toMatchObject({ ward: 1, resources: 2, kills: 12, dn: 7, networth: 23 });
    expect(LANE_WEIGHTS[4]).toMatchObject({ dn: 3, kills: 7 });
    expect(LANE_WEIGHTS[5]).toMatchObject({ resources: 25, kills: 5, deaths: 20 });
    const result = calculateLaneEfficiency(base);
    const fallback = calculateLaneEfficiency({ ...base, requestedReferenceMonth: "2026-09-01" });
    expect(fallback.referenceMonth).toBe("2026-08");
    expect(fallback.notes).toContain("مرجع 2026-09 هنوز آماده نیست؛ این امتیاز موقتاً با مرجع 2026-08 محاسبه شده است.");
    expect(result.cohort).toBe("hero-position");
    expect(result.parts.find(row => row.key === "lh")).toMatchObject({ value: 2.5, maximum: 5, actual: 10, mean: 10 });
    expect(result.parts.find(row => row.key === "deaths")).toMatchObject({ value: 20, maximum: 20, actual: 0 });
    expect(result.parts.find(row => row.key === "assists")).toMatchObject({ value: 6, maximum: 12, actual: 4 });
    expect(result.parts.find(row => row.key === "ward")?.value).toBeCloseTo(12.5); // 4 + 3 + 2 + 1 + 2.5
    expect(result.parts.find(row => row.key === "resources")?.value).toBeCloseTo(11.25 * 25 / 26); // 5 + 3 + 2 + 1.25
    expect(result.bonus).toBe(1); // verified out-of-lane Kill and justified Dust
    expect(result.score).toBe(Math.round(result.subtotal + 1));
  });

  it("uses the full-position cohort if hero coverage is absent; never fabricates a missing mean", () => {
    const fallback = calculateLaneEfficiency({ ...base, heroId: 1,
      events: { ...events, snapshots: [{ ...events.snapshots[0], heroId: 1 }] } });
    expect(fallback.cohort).toBe("position");
    expect(fallback.parts.find(row => row.key === "lh")?.mean).toBe(15);
    const missing = calculateLaneEfficiency({ ...base, reference: undefined });
    expect(missing.status).toBe("partial");
    expect(missing.score).toBe(Math.round(missing.subtotal / missing.covered * 100 + missing.bonus));
    expect(missing.parts.find(row => row.key === "lh")?.value).toBeNull();
    expect(missing.covered).toBe(52); // Ward 27 + Resources 25, not a fake zero for six stats
  });

  it("does not award a deward when a ward naturally expires with an attacker field", () => {
    const result = calculateLaneEfficiency({ ...base, events: { ...events,
      wards: events.wards.map(row => row.handle === 3 && row.type === "obs_left"
        ? { ...row, time: 360 } : row) } });
    expect(result.parts.find(row => row.key === "ward")?.value).toBeCloseTo(10);
  });

  it("excludes actions after 10:00 but keeps late removal evidence for a ward placed before 10:00", () => {
    const late = calculateLaneEfficiency({ ...base, events: { ...events,
      purchases: [...events.purchases, { slot: 3, time: 710, item: "item_flask", charges: 1 }],
      wards: [...events.wards, { slot: 3, type: "obs", time: 650, handle: 8, attackerSlot: null },
        { slot: 3, type: "obs_left", time: 870, handle: 8, attackerSlot: null }],
    } });
    const original = calculateLaneEfficiency(base);
    expect(late.parts.find(row => row.key === "resources")?.actual).toEqual(original.parts.find(row => row.key === "resources")?.actual);
    expect(late.parts.find(row => row.key === "ward")?.actual).toEqual(original.parts.find(row => row.key === "ward")?.actual);
  });

  it("normalizes only available weights, preserves zero and applies bonus afterwards", () => {
    const partial = calculateLaneEfficiency({ ...base, events: { ...events, snapshots: [{ ...events.snapshots[0], networth: Number.NaN }] } });
    expect(partial.covered).toBe(97);
    expect(partial.parts.find(p => p.key === "deaths")?.actual).toBe(0);
    expect(partial.parts.find(p => p.key === "networth")).toMatchObject({ actual: null, value: null, reason: "missing-events" });
    expect(partial.normalized).toBeCloseTo(partial.subtotal / 97 * 100);
    expect(partial.score).toBe(Math.round(partial.subtotal / 97 * 100 + partial.bonus));
    const noData = calculateLaneEfficiency({ ...base, reference: undefined, events: undefined });
    expect(noData).toMatchObject({ covered: 0, normalized: null, score: null, status: "unavailable" });
  });

  it.each([
    [3, 1, 75, 140, .5], [3, 5, 140, 75, 0],
    [3, 3, 140, 75, .5], [3, 4, 75, 140, 0],
    [128, 1, 140, 75, .5], [128, 5, 75, 140, 0],
    [128, 3, 75, 140, .5], [128, 4, 140, 75, 0],
    [3, 2, 75, 140, .5], [128, 2, 140, 75, .5],
    [3, 2, 105, 105, 0], [3, 1, 105, 105, .5],
  ])("uses actor position and team mapping slot%s pos%s at%s,%s", (slot, position, x, y, expected) => {
    const enemy = slot < 128 ? 129 : 3;
    const result = calculateLaneEfficiency({ ...base, slot, position, heroIds: new Map(), events: { ...events,
      snapshots: [{ ...events.snapshots[0], slot }], purchases: [], wards: [],
      combat: [{ time: 280, attackerSlot: slot, targetSlot: enemy, actorLocation: { x, y, sampledAt: 280, source: "interval" }, targetLocation: { x: x + 1, y, sampledAt: 280, source: "interval" } }],
    } });
    expect(result.bonus).toBe(expected);
  });

  it("rejects remote, river, jungle, stale, out-of-window and friendly Join evidence; caps proven bonuses", () => {
    const remote = calculateLaneEfficiency({ ...base, heroIds: new Map(), events: { ...events, combat: [],
      assists: [{ slot: 3, targetSlot: 129, time: 280, actorLocation: { x: 105, y: 105, sampledAt: 280, source: "interval" }, targetLocation: { x: 77, y: 140, sampledAt: 280, source: "interval" } }] } });
    expect(remote.bonus).toBe(0); // Actor is off home lane, but the fight is far away.
    for (const location of [undefined, { x: 128, y: 128, sampledAt: 280, source: "interval" as const },
      { x: 110, y: 145, sampledAt: 280, source: "interval" as const },
      { x: 75, y: 140, sampledAt: 277, source: "interval" as const }]) {
      const result = calculateLaneEfficiency({ ...base, heroIds: new Map(), events: { ...events, combat: [{ ...events.combat[0], actorLocation: location }], assists: [{ slot: 3, targetSlot: 129, time: 280, actorLocation: location }] } });
      expect(result.bonus).toBe(0);
      expect(result.details.bonus.events[0].reason).toBe("unproven-location");
    }
    const result = calculateLaneEfficiency({ ...base, events: { ...events,
      combat: [0, 1, 2, 3].map(i => ({ ...events.combat[0], time: 280 + i, actorLocation: { x: 75, y: 140, sampledAt: 280 + i, source: "interval" as const }, targetLocation: { x: 77, y: 140, sampledAt: 280 + i, source: "interval" as const } })),
      assists: [{ slot: 3, targetSlot: 129, time: 610, actorLocation: { x: 75, y: 140, sampledAt: 610, source: "interval" }, targetLocation: { x: 77, y: 140, sampledAt: 280, source: "interval" } }],
    } });
    expect(result.bonus).toBe(1.5);
    expect(result.details.bonus.events).toHaveLength(5); // Four joins + one Dust, late assist excluded.
    expect(calculateLaneEfficiency({ ...base, duration: 599 }).score).toBeNull();
    expect(calculateLaneEfficiency({ ...base, position: null }).score).toBeNull();
  });

  it("recalculates weights, means and home-lane bonus after known and unknown role corrections", () => {
    const roleReference: LaneReference = { ...reference, position: [...reference.position,
      { ...reference.position[0], position: 3, cs: 40, networth: 4000 }] };
    for (const position of [5, null]) {
      const original = calculateLaneEfficiency({ ...base, position, reference: roleReference });
      const updated = recalculateLanePosition(original, 3);
      const direct = calculateLaneEfficiency({ ...base, position: 3, reference: roleReference });
      expect(updated.parts).toEqual(direct.parts);
      expect(updated.score).toEqual(direct.score);
      expect(updated.cohort).toBe("position");
      expect(updated.parts.find(part => part.key === "ward")?.maximum).toBe(1);
      expect(updated.bonus).toBe(.5); // Top is now home; only Dust remains.
    }
    const missing = recalculateLanePosition(calculateLaneEfficiency({ ...base, position: null, events: undefined }), 3);
    expect(missing.parts.every(part => part.reason === "missing-replay")).toBe(true);
  });

  it("does not silently grade Turbo or old replay data", () => {
    expect(calculateLaneEfficiency({ ...base, gameMode: 23 }).score).toBeNull();
    expect(calculateLaneEfficiency({ ...base, events: undefined }).score).toBeNull();
    expect(calculateLaneEfficiency({ ...base, events: { version: 1 } as LaneEvents }).score).toBeNull();
  });
});
