import { describe, expect, it } from "vitest";
import { classifyFarmKills } from "../lib/dota/farm-kills";
import replaySample from "./fixtures/farm-kills-sample.json";

describe("farm categories from killed units", () => {
  it("reproduces the 10 players in replay 9008411473 without counting denies or summons", () => {
    const expected = [
      [0, 157, 63, 6], [1, 31, 9, 0], [2, 141, 9, 3],
      [3, 172, 33, 3], [4, 18, 0, 0], [128, 108, 83, 4],
      [129, 10, 25, 0], [130, 124, 39, 3],
      [131, 116, 143, 3], [132, 18, 1, 0],
    ];
    expect(replaySample.map((player) => {
      const farm = classifyFarmKills(player);
      return [player.player_slot, farm.lane, farm.neutral, farm.ancient];
    })).toEqual(expected);
  });

  it("does not infer lane kills from OpenDota's lane_kills when the killed log is missing", () => {
    expect(classifyFarmKills({ player_slot: 0, lane_kills: 176, denies: 23, neutral_kills: 69, ancient_kills: 6 }))
      .toEqual({ lane: null, neutral: 63, ancient: 6 });
    expect(classifyFarmKills({ player_slot: 0, neutral_kills: 2, ancient_kills: 3 }))
      .toEqual({ lane: null, neutral: null, ancient: 3 });
  });

  it("keeps explicit zero farm counts from a replay", () => {
    expect(classifyFarmKills({ player_slot: 128, killed: { npc_dota_creep_badguys_melee: 3, npc_dota_hero_axe: 1 } }))
      .toEqual({ lane: 0, neutral: 0, ancient: 0 });
  });
});
