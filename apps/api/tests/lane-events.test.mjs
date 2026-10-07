import { describe, expect, it } from "vitest";
import { createLaneCollector } from "../scripts/replay-parser/lane-events.mjs";

describe("raw replay Lane extractor", () => {
  it("resolves buyer and ward attacker by hero identity after observing the minute-12 intervals", () => {
    const collector = createLaneCollector();
    const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
    for (let i = 0; i < 10; i++) collector.accept({ type: "player_slot", key: i, value: slots[i] });
    collector.accept({ type: "DOTA_COMBATLOG_PURCHASE", time: -89,
      targetname: "npc_dota_hero_warlock", valuename: "item_tango", charges: 6 });
    collector.accept({ type: "obs_left", slot: 8, time: 140, ehandle: 198,
      attackername: "npc_dota_hero_warlock" });
    collector.accept({ type: "interval", slot: 1, time: 100, assists: 0 });
    collector.accept({ type: "DOTA_COMBATLOG_DEATH", time: 104, targethero: true,
      targetname: "npc_dota_hero_test6", attackername: "npc_dota_hero_test0" });
    collector.accept({ type: "interval", slot: 1, time: 105, assists: 1 });
    for (let i = 0; i < 10; i++) collector.accept({ type: "interval", slot: i, time: 720,
      hero_id: i === 1 ? 37 : i + 100, unit: i === 1 ? "CDOTA_Unit_Hero_Warlock" : `CDOTA_Unit_Hero_Test${i}`,
      kills: 1, deaths: 0, assists: i === 1 ? 6 : 0, networth: 2000, lh: 5, denies: 2 });
    const output = collector.finish();
    expect(output.snapshots).toHaveLength(10);
    expect(output.snapshots.every(row => row.time === 720)).toBe(true);
    expect(output.snapshots.find(row => row.slot === 1)?.assists).toBe(6);
    expect(output.purchases[0].slot).toBe(1);
    expect(output.wards[0]).toMatchObject({ slot: 131, attackerSlot: 1 });
    expect(output.assists).toEqual([{ slot: 1, targetSlot: 129, time: 104 }]);
  });
});
