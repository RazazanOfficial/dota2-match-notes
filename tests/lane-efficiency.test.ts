import { describe, expect, it } from "vitest";
import { calculateLaneEfficiency, LANE_WEIGHTS, type LaneEvents, type LaneReference } from "../lib/dota/lane-efficiency";
import { qualifiesHeroPosition } from "../lib/monthly-reference/service";
import firstMatch from "./fixtures/lane-9017352046.json";
import secondMatch from "./fixtures/lane-9017779833.json";

const reference: LaneReference = { month: "2026-08", versionId: "reference-v1", hero: [
  { heroId: 37, position: 5, sampleCount: 721, cs: 10, deaths: 2, networth: 2000, dn: 2, kills: 1, assists: 4 },
], position: [{ position: 5, sampleCount: 100000, cs: 15, deaths: 1, networth: 2500, dn: 3, kills: 2, assists: 3 }] };

const events: LaneEvents = {
  version: 1,
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
  combat: [{ time: 280, attackerSlot: 3, targetSlot: 129 }],
};
const base = { slot: 3, heroId: 37, position: 5, duration: 2500, gameMode: 22, lobbyType: 7,
  positions: new Map([[3, 5], [128, 3], [129, 2]]), heroIds: new Map([[3, 37], [128, 62], [129, 1]]),
  reference, events };

describe("Lane Efficiency contract", () => {
  it("grades all ten players in each supplied replay with the August Divine/Immortal time-11 means", () => {
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
        expect(result.score, `match ${fixture.matchId}, slot ${snapshot.slot}: ${JSON.stringify(result.parts.filter(p => p.value === null))}`).not.toBeNull();
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

  it("uses the per-position 100-point weights and an actual replay minute-10 scoreboard", () => {
    for (const weights of Object.values(LANE_WEIGHTS)) expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(100);
    const result = calculateLaneEfficiency(base);
    const fallback = calculateLaneEfficiency({ ...base, requestedReferenceMonth: "2026-09-01" });
    expect(fallback.referenceMonth).toBe("2026-08");
    expect(fallback.notes).toContain("مرجع 2026-09 هنوز آماده نیست؛ این امتیاز موقتاً با مرجع 2026-08 محاسبه شده است.");
    expect(result.cohort).toBe("hero-position");
    expect(result.parts.find(row => row.key === "lh")).toMatchObject({ value: 2.5, maximum: 5, actual: 10, mean: 10 });
    expect(result.parts.find(row => row.key === "deaths")).toMatchObject({ value: 18, maximum: 18, actual: 0 });
    expect(result.parts.find(row => row.key === "assists")).toMatchObject({ value: 6, maximum: 12, actual: 4 });
    expect(result.parts.find(row => row.key === "ward")?.value).toBeCloseTo(12.5); // 4 + 3 + 2 + 1 + 2.5
    expect(result.parts.find(row => row.key === "resources")?.value).toBeCloseTo(11.25); // 5 + 3 + 2 + 1.25
    expect(result.bonus).toBe(1); // verified out-of-lane Kill and justified Dust
    expect(result.score).toBe(Math.round(result.subtotal + 1));
  });

  it("uses the full-position cohort if hero coverage is absent; never fabricates a missing mean", () => {
    const fallback = calculateLaneEfficiency({ ...base, heroId: 1,
      events: { ...events, snapshots: [{ ...events.snapshots[0], heroId: 1 }] } });
    expect(fallback.cohort).toBe("position");
    expect(fallback.parts.find(row => row.key === "lh")?.mean).toBe(15);
    const missing = calculateLaneEfficiency({ ...base, reference: undefined });
    expect(missing.score).toBeNull();
    expect(missing.parts.find(row => row.key === "lh")?.value).toBeNull();
    expect(missing.covered).toBe(53); // Ward 27 + Resources 26, not a fake zero for six stats
  });

  it("does not award a deward when a ward naturally expires with an attacker field", () => {
    const result = calculateLaneEfficiency({ ...base, events: { ...events,
      wards: events.wards.map(row => row.handle === 3 && row.type === "obs_left"
        ? { ...row, time: 360 } : row) } });
    expect(result.parts.find(row => row.key === "ward")?.value).toBeCloseTo(10);
  });

  it("does not silently grade Turbo or old replay data", () => {
    expect(calculateLaneEfficiency({ ...base, gameMode: 23 }).score).toBeNull();
    expect(calculateLaneEfficiency({ ...base, events: undefined }).score).toBeNull();
    expect(calculateLaneEfficiency({ ...base, events: { version: 1 } as LaneEvents }).score).toBeNull();
  });
});
