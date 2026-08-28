import { describe, expect, it } from "vitest";
import { extractMatchDetails } from "../lib/dota/match-details";

const matchPayload = {
  match_id: 8_967_968_620,
  start_time: 1_787_920_000,
  duration: 2_945,
  radiant_win: true,
  radiant_score: 48,
  dire_score: 31,
  game_mode: 22,
  lobby_type: 7,
  players: [
    {
      account_id: 988_195_076,
      personaname: "Meraj",
      player_slot: 0,
      hero_id: 48,
      level: 30,
      kills: 15,
      deaths: 4,
      assists: 18,
      last_hits: 438,
      denies: 12,
      gold_per_min: 731,
      xp_per_min: 842,
      net_worth: 36_450,
      hero_damage: 48_200,
      tower_damage: 6_130,
      hero_healing: 0,
      item_0: 108,
      item_1: 50,
      item_2: 63,
      item_3: 139,
      item_4: 116,
      item_5: 147,
      backpack_0: 38,
      backpack_1: 40,
      backpack_2: 46,
      item_neutral: 289,
      item_neutral2: 0,
      aghanims_scepter: 0,
      aghanims_shard: 1,
    },
    {
      account_id: null,
      personaname: null,
      player_slot: 128,
      hero_id: 2,
      level: 27,
      kills: 8,
      deaths: 10,
      assists: 16,
      item_0: 0,
      item_1: 1,
      item_2: 0,
      item_3: 0,
      item_4: 0,
      item_5: 0,
      backpack_0: 0,
      backpack_1: 0,
      backpack_2: 0,
      item_neutral: 0,
      aghanims_scepter: false,
      aghanims_shard: false,
    },
  ],
};

describe("match details extraction", () => {
  it("normalizes teams, scores, statistics and all inventory slots", () => {
    const details = extractMatchDetails(matchPayload, 988_195_076, 48);

    expect(details).toMatchObject({
      radiantWin: true,
      radiantScore: 48,
      direScore: 31,
    });
    expect(details.participants).toHaveLength(2);
    expect(details.participants[0]).toMatchObject({
      team: "radiant",
      heroName: "Luna",
      isProfilePlayer: true,
      hasAghanimsScepter: true,
      hasAghanimsShard: true,
      neutralItemId: 289,
    });
    expect(details.participants[0].itemIds).toEqual([108, 50, 63, 139, 116, 147]);
    expect(details.participants[0].backpackItemIds).toEqual([38, 40, 46]);
    expect(details.participants[1]).toMatchObject({
      team: "dire",
      heroName: "Axe",
      accountId: null,
      personName: "بازیکن ناشناس",
    });
    expect(details.participants[1].itemIds).toEqual([null, 1, null, null, null, null]);
  });

  it("falls back to the journal hero when OpenDota hides the account id", () => {
    const anonymous = {
      ...matchPayload,
      players: matchPayload.players.map((player) => ({ ...player, account_id: null })),
    };

    const details = extractMatchDetails(anonymous, null, 48);
    expect(details.participants.find((player) => player.heroId === 48)?.isProfilePlayer).toBe(true);
  });

  it("returns an empty safe result for an invalid stored snapshot", () => {
    expect(extractMatchDetails({ match_id: 1 }, 988_195_076, 48)).toEqual({
      radiantWin: null,
      radiantScore: null,
      direScore: null,
      participants: [],
    });
  });
});
