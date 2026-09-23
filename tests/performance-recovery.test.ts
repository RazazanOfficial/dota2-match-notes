import { describe, expect, it } from "vitest";
import { buildMatchAnalysis } from "../lib/dota/match-analysis";
import { dotaCoordinate } from "../lib/dota/match-map-analysis";

const heroIds = [1,2,3,4,5,6,7,8,9,10];
function basePlayers() {
  return heroIds.map((heroId,index) => ({
    account_id: 50_000 + index,
    player_slot: index < 5 ? index : 128 + index - 5,
    hero_id: heroId,
    kills: 5,
    deaths: 4,
    assists: 9,
    last_hits: 100,
    gold_per_min: 450,
    xp_per_min: 550,
    hero_damage: 12_000,
    hero_healing: 0,
    tower_damage: 500,
  }));
}

describe("performance recovery regressions", () => {
  it("does not invent timeline metrics for an unparsed match", () => {
    const players = basePlayers();
    const analysis = buildMatchAnalysis({
      profileAccountId: 50_000,
      rawData: { match_id: 8979219268, start_time: 1_787_000_000, duration: 2_760, radiant_win: false, players },
    });
    const atFive = analysis?.players[0].timeline.find((point) => point.minute === 5);
    expect(atFive).toBeUndefined();
    expect(analysis?.parsed).toBe(false);
    expect(analysis?.players[0].map?.farm.farmUptimePercent).toBeNull();
    expect(analysis?.players[0].map?.movement.availability).toBe("unavailable");
  });

  it("maps OpenDota grid coordinates inside the Dota map and keeps objectives factual", () => {
    const players = basePlayers().map((player,index) => index ? player : {
      ...player,
      times: [0,60,120,180,240,300],
      gold_t: [600,800,1_000,1_150,1_260,1_380],
      xp_t: [0,180,420,760,1_100,1_490],
      lh_t: [0,2,5,9,13,17],
      dn_t: [0,0,1,2,4,6],
      lane_pos: { 113: { 138: 10 } },
      obs_placed: 1,
      obs_log: [{ time: 500, ehandle: 1, x: 113, y: 138 }],
      obs_left_log: [{ time: 860, ehandle: 1 }],
      kills_log: [{ time: 600, key: "npc_dota_hero_riki", smoke: true }],
      purchase_log: [{ time: 550, key: "smoke_of_deceit" }],
    });
    const analysis = buildMatchAnalysis({
      profileAccountId: 50_000,
      rawData: {
        match_id: 8979747211,
        version: 22,
        start_time: 1_787_000_000,
        duration: 2_760,
        radiant_win: true,
        objectives: [{ time: 700, type: "CHAT_MESSAGE_TOWER_KILL", key: "npc_dota_badguys_tower1_mid" }],
        players,
      },
    });
    const profile = analysis?.players[0];
    const presence = profile?.map?.points.find((point) => point.type === "movement");
    expect(dotaCoordinate(113)).toBeCloseTo(38.28125, 4);
    expect(presence?.x).toBeCloseTo(38.28125, 4);
    expect(presence?.y).toBeCloseTo(42.1875, 4);
    expect(profile?.map?.coordinateSource).toBe("aggregate");
    expect(profile?.map?.objectives.events[0]).toMatchObject({ type: "tower", playerPresent: null, convertedFromFight: null });
    expect(profile?.map?.utility).toMatchObject({ smokeUses: 1, smokeKillParticipations: 1, successfulSmokes: null });
    expect(profile?.scoreMetrics).toEqual([]);
    expect(analysis?.parsed).toBe(true);
  });
});
