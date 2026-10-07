import { describe, expect, it } from "vitest";
import { buildMatchAnalysis } from "../lib/dota/match-analysis";
import { overlayReplayData, validateReplayBlob } from "../lib/replay/overlay";

const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
const matchId = 9008411473;

function replay() {
  return {
    match_id: matchId,
    version: 22,
    teamfights: [],
    objectives: [{ time: 21, type: "building_kill" }],
    players: slots.map((player_slot) => ({
      player_slot,
      times: [0, 60, 120],
      gold_t: [0, 90, 150],
      xp_t: [0, 110, 190],
      lh_t: [0, 1, 2],
      dn_t: [0, 0, 0],
      networth_t: [598, 688, 748],
      camps_stacked_t: [0, 1, 1],
      hero_damage_t: [0, 10, 20],
      hero_healing_t: [0, 5, 5],
      camps_stacked: 1,
      purchase_log: [{ time: 0, key: "tango" }],
    })),
  };
}

function summary() {
  return {
    match_id: matchId,
    start_time: 1_790_000_000,
    duration: 120,
    radiant_win: true,
    objectives: [{ time: 21, type: "building_kill", victim_player_slot: 128 }],
    players: slots.map((player_slot, index) => ({
      player_slot,
      hero_id: index + 1,
      account_id: index + 20,
      kills: 1,
      deaths: 0,
      assists: 2,
      gold_per_min: 400,
      xp_per_min: 480,
      gold_t: [0, 0, 0],
      purchase_log: [{ time: 0, key: "ward_observer" }],
    })),
  };
}

describe("local replay overlay", () => {
  it("uses verified parser timelines and preserves OpenDota identity, KDA and enriched logs", () => {
    const input = summary();
    const selected = overlayReplayData(input, replay());
    expect(selected.source).toBe("local");
    expect(selected.match).not.toBe(input);
    expect(input.players[0].gold_t).toEqual([0, 0, 0]);
    const players = selected.match.players as Array<Record<string, unknown>>;
    expect(players).toHaveLength(10);
    expect(players[0]).toMatchObject({ hero_id: 1, account_id: 20, kills: 1, camps_stacked: 1 });
    expect(players[0].networth_t).toEqual([598, 688, 748]);
    expect(players[0].purchase_log).toEqual(input.players[0].purchase_log);
    expect(selected.match.objectives).toEqual(input.objectives);
    expect(selected.match.radiant_win).toBe(true);
    const analysis = buildMatchAnalysis({ rawData: selected.match, replaySource: selected.source });
    expect(analysis?.replaySource).toBe("local");
    expect(analysis?.players[0].timelineSource).toBe("local");
    expect(analysis?.players[0].timeline.map((point) => point.gold)).toEqual([598, 688, 748]);
  });

  it("rejects wrong match IDs, duplicate slots, and incomplete timelines without partial overlay", () => {
    const base = summary();
    const wrong = replay();
    wrong.match_id = matchId + 1;
    expect(overlayReplayData(base, wrong)).toEqual({ match: base, source: "opendota" });
    const duplicate = replay();
    duplicate.players[9].player_slot = 0;
    expect(() => validateReplayBlob(duplicate, matchId)).toThrow(/slots/);
    const incomplete = replay();
    incomplete.players[0].networth_t.pop();
    expect(overlayReplayData(base, incomplete).source).toBe("opendota");
    expect(overlayReplayData(base, null).match).toBe(base);
  });

  it("falls back to parser purchases and objectives only if OpenDota lacks them", () => {
    const base = summary();
    const { objectives: _ignored, ...withoutObjectives } = base;
    const sparse = { ...withoutObjectives, players: base.players.map(({ purchase_log: _p, ...player }) => player) };
    const selected = overlayReplayData(sparse, replay());
    expect(selected.match.objectives).toEqual(replay().objectives);
    expect((selected.match.players as Array<Record<string, unknown>>)[0].purchase_log).toEqual(replay().players[0].purchase_log);
  });
});
