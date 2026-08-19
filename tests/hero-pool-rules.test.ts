import { describe, expect, it } from "vitest";
import { heroPoolSizeState, isHeroPoolEligibleMode } from "../lib/hero-pool/rules";
import { collectAutomaticBans, suggestMatchRole } from "../lib/opendota/match-insights";
import { parseOpenDotaMatch } from "../lib/opendota/validation";

const match = parseOpenDotaMatch({
  match_id: 9000000001,
  start_time: 1787100000,
  duration: 2400,
  radiant_win: true,
  game_mode: 22,
  lobby_type: 7,
  picks_bans: [
    { is_pick: false, hero_id: 74, team: 0, order: 0 },
    { is_pick: true, hero_id: 1, team: 0, order: 1 },
    { is_pick: false, hero_id: 25, team: 1, order: 2 },
  ],
  players: [
    { player_slot: 0, hero_id: 1, lane_role: 1, net_worth: 22000 },
    { player_slot: 1, hero_id: 8, lane_role: 2, net_worth: 21000 },
    { player_slot: 2, hero_id: 44, lane_role: 3, net_worth: 18000 },
    { player_slot: 3, hero_id: 5, lane_role: 1, net_worth: 9000 },
    { player_slot: 4, hero_id: 26, lane_role: 1, net_worth: 7000 },
  ],
}, 9000000001);

describe("hero pool rules", () => {
  it("blocks Single Draft and accepts the reviewed matchmaking modes", () => {
    expect(isHeroPoolEligibleMode(4, 7)).toBe(false);
    expect(isHeroPoolEligibleMode(1, 0)).toBe(true);
    expect(isHeroPoolEligibleMode(2, 2)).toBe(true);
    expect(isHeroPoolEligibleMode(22, 7)).toBe(true);
    expect(isHeroPoolEligibleMode(23, 0)).toBe(true);
    expect(isHeroPoolEligibleMode(3, 0)).toBe(false);
  });

  it("grades two through eight without allowing an unbounded pool", () => {
    expect(heroPoolSizeState(2)).toBe("minimum");
    expect(heroPoolSizeState(3)).toBe("ideal");
    expect(heroPoolSizeState(5)).toBe("ideal");
    expect(heroPoolSizeState(6)).toBe("caution");
    expect(heroPoolSizeState(8)).toBe("overload");
  });

  it("suggests a role from lane and team economy while keeping it editable", () => {
    expect(suggestMatchRole(match, match.players[0])).toBe("safe_lane");
    expect(suggestMatchRole(match, match.players[1])).toBe("mid_lane");
    expect(suggestMatchRole(match, match.players[3])).toBe("soft_support");
    expect(suggestMatchRole(match, match.players[4])).toBe("hard_support");
  });

  it("keeps only actual bans in draft order", () => {
    expect(collectAutomaticBans(match)).toEqual([
      { heroId: 74, heroName: "Invoker", team: 0, draftOrder: 0 },
      { heroId: 25, heroName: "Lina", team: 1, draftOrder: 2 },
    ]);
  });
});
