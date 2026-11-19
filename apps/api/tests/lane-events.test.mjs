import { describe, expect, it } from "vitest";
import { createLaneCollector } from "../scripts/replay-parser/lane-events.mjs";

const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
function collectorWithSlots() {
  const collector = createLaneCollector();
  slots.forEach((slot, i) => collector.accept({ type: "player_slot", key: i, value: slot }));
  return collector;
}
function snapshots(collector) {
  slots.forEach((_, i) => collector.accept({ type: "interval", slot: i, time: 600,
    hero_id: i === 1 ? 37 : i + 100, unit: i === 1 ? "CDOTA_Unit_Hero_Warlock" : `CDOTA_Unit_Hero_Test${i}`,
    kills: 1, deaths: 0, assists: i === 1 ? 6 : 0, networth: 2000, lh: 5, denies: 2 }));
}
const death = (time, attacker = "npc_dota_hero_test0") => ({ type: "DOTA_COMBATLOG_DEATH", time, targethero: true,
  targetname: "npc_dota_hero_test6", attackername: attacker });

describe("raw replay Lane extractor v2", () => {
  it("keeps minute-10 counters and attributes kill/assist locations to their own heroes", () => {
    const collector = collectorWithSlots();
    collector.accept({ type: "DOTA_COMBATLOG_PURCHASE", time: -89,
      targetname: "npc_dota_hero_warlock", valuename: "item_tango", charges: 6 });
    collector.accept({ type: "obs_left", slot: 8, time: 140, ehandle: 198,
      attackername: "npc_dota_hero_warlock" });
    collector.accept({ type: "interval", slot: 1, time: 100, assists: 0 });
    collector.accept({ type: "interval", slot: 0, time: 103, life_state: 0, x: 100, y: 170 });
    collector.accept({ type: "interval", slot: 6, time: 104, life_state: 0, x: 170, y: 100 });
    collector.accept(death(104));
    collector.accept({ type: "interval", slot: 1, time: 105, assists: 1, life_state: 0, x: 110.5, y: 175.25 });
    snapshots(collector);
    const output = collector.finish();
    expect(output).toMatchObject({ version: 2, snapshotAt: 600, coordinateSystem: "dota-grid" });
    expect(output.snapshots).toHaveLength(10);
    expect(output.snapshots.every(row => row.time === 600)).toBe(true);
    expect(output.snapshots.find(row => row.slot === 1)?.assists).toBe(6);
    expect(output.purchases[0].slot).toBe(1);
    expect(output.wards[0]).toMatchObject({ slot: 131, attackerSlot: 1 });
    expect(output.combat).toEqual([{ time: 104, targetSlot: 129, attackerSlot: 0,
      actorLocation: { x: 100, y: 170, sampledAt: 103, source: "interval" },
      targetLocation: { x: 170, y: 100, sampledAt: 104, source: "interval" } }]);
    expect(output.assists).toEqual([{ slot: 1, targetSlot: 129, time: 104,
      actorLocation: { x: 110.5, y: 175.25, sampledAt: 105, source: "interval" },
      targetLocation: { x: 170, y: 100, sampledAt: 104, source: "interval" } }]);
  });
  it("preserves remote versus nearby assist evidence and uses bounded pre-death victim locations", () => {
    const collector = collectorWithSlots();
    collector.accept({ type: "interval", slot: 1, time: 99, assists: 0, life_state: 0, x: 136, y: 136 });
    collector.accept({ type: "interval", slot: 6, time: 99, life_state: 0, x: 100, y: 176 });
    collector.accept(death(100));
    collector.accept({ type: "interval", slot: 6, time: 100, life_state: 2, x: 40, y: 40 });
    collector.accept({ type: "interval", slot: 6, time: 101, life_state: 0, x: 136, y: 136 });
    collector.accept({ type: "interval", slot: 1, time: 100, assists: 1, life_state: 0, x: 136, y: 136 });
    collector.accept({ type: "interval", slot: 1, time: 199, assists: 1, life_state: 0, x: 100, y: 178 });
    collector.accept({ type: "interval", slot: 6, time: 198, life_state: 0, x: 105, y: 176 });
    collector.accept(death(200));
    collector.accept({ type: "interval", slot: 6, time: 200, life_state: 2, x: 40, y: 40 });
    collector.accept({ type: "interval", slot: 1, time: 200, assists: 2, life_state: 0, x: 100, y: 178 });
    snapshots(collector);
    const output = collector.finish(), [remote, nearby] = output.assists;
    expect(output.combat.map(row => row.targetLocation)).toEqual([
      { x: 100, y: 176, sampledAt: 99, source: "interval" },
      { x: 105, y: 176, sampledAt: 198, source: "interval" },
    ]);
    expect(remote.targetLocation).toEqual(output.combat[0].targetLocation);
    expect(nearby.targetLocation).toEqual(output.combat[1].targetLocation);
    expect(Math.hypot(remote.actorLocation.x - remote.targetLocation.x, remote.actorLocation.y - remote.targetLocation.y)).toBeGreaterThan(16);
    expect(Math.hypot(nearby.actorLocation.x - nearby.targetLocation.x, nearby.actorLocation.y - nearby.targetLocation.y)).toBeLessThanOrEqual(16);
  });
  it("does not locate a victim from a future, stale or dead-only sample", () => {
    for (const sample of [{ time: 101, life_state: 0 }, { time: 97, life_state: 0 }, { time: 100, life_state: 2 }]) {
      const collector = collectorWithSlots();
      collector.accept({ type: "interval", slot: 6, x: 100, y: 176, ...sample });
      collector.accept(death(100));
      snapshots(collector);
      expect(collector.finish().combat[0].targetLocation).toBeNull();
    }
  });
  it("never borrows a victim location or interpolates stale, dead or invalid actor samples", () => {
    const collector = collectorWithSlots();
    collector.accept({ type: "interval", slot: 0, time: 100, life_state: 0, x: 100, y: 170 });
    collector.accept({ type: "interval", slot: 2, time: 103, life_state: 0, x: 100, y: 170 });
    collector.accept({ type: "interval", slot: 2, time: 104, life_state: 2, x: 100, y: 170 });
    collector.accept({ type: "interval", slot: 3, time: 104, life_state: 0, x: 300, y: 170 });
    collector.accept({ type: "interval", slot: 4, time: 104, x: 100, y: 170 });
    collector.accept({ type: "interval", slot: 6, time: 104, life_state: 0, x: 100, y: 170 });
    for (const actor of [0, 2, 3, 4, 5]) collector.accept(death(104, `npc_dota_hero_test${actor}`));
    snapshots(collector);
    expect(collector.finish().combat.map(row => row.actorLocation)).toEqual([null, null, null, null, null]);
  });
  it("bounds location matching to two seconds and prefers earlier evidence on an equal-distance tie", () => {
    const collector = collectorWithSlots();
    collector.accept({ type: "interval", slot: 0, time: 102, life_state: 0, x: 100, y: 170 });
    collector.accept({ type: "interval", slot: 0, time: 106, life_state: 0, x: 170, y: 100 });
    collector.accept(death(104));
    snapshots(collector);
    expect(collector.finish().combat[0].actorLocation).toEqual({ x: 100, y: 170, sampledAt: 102, source: "interval" });
  });
  it("excludes post-window combat and purchases while retaining ward removals after ten minutes", () => {
    const collector = collectorWithSlots();
    collector.accept(death(601));
    collector.accept({ type: "DOTA_COMBATLOG_PURCHASE", time: 601, targetname: "npc_dota_hero_test0", valuename: "item_dust" });
    collector.accept({ type: "obs", slot: 0, time: 599, ehandle: 10 });
    collector.accept({ type: "obs_left", slot: 0, time: 850, ehandle: 10 });
    snapshots(collector);
    const output = collector.finish();
    expect(output.combat).toEqual([]);
    expect(output.purchases).toEqual([]);
    expect(output.wards.map(row => row.time)).toEqual([599, 850]);
  });
  it("rejects a minute-12-only or incomplete snapshot instead of relabeling old data", () => {
    const collector = collectorWithSlots();
    slots.forEach((_, i) => collector.accept({ type: "interval", slot: i, time: 720, hero_id: i + 100 }));
    expect(() => collector.finish()).toThrow("Incomplete minute-10 Lane snapshots");
  });
});
