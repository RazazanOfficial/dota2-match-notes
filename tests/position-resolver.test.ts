import { describe, expect, it } from "vitest";
import { resolveMatchPositions } from "../lib/dota/position-resolver";

const lanePos = (lane: "top" | "mid" | "bottom") => {
  const [x, y] = lane === "top" ? [90, 165] : lane === "bottom" ? [165, 90] : [128, 128];
  return { [x]: { [y]: 180 } };
};

function player(slot: number, lane: "top" | "mid" | "bottom", lh10: number, wardCount: number) {
  return {
    player_slot: slot,
    lane_pos: lanePos(lane),
    lh_t: Array.from({ length: 11 }, (_, minute) => Math.round(lh10 * minute / 10)),
    obs_log: Array.from({ length: wardCount }, () => ({ time: 220 })),
    gold_per_min: lh10 > 25 ? 700 : 290,
  };
}

describe("position resolution from the first ten minutes of a replay", () => {
  it("matches all ten confirmed positions in match 9013078038 using the replay lane counts", () => {
    // Read-only aggregates from the imported replay. Only the coordinates
    // within each lane change here; the resolver sees the same bin totals.
    const observed = [
      { slot: 0, lh: 23, mid: 621, top: 2, bottom: 0, expected: 2 },
      { slot: 1, lh: 40, mid: 6, top: 647, bottom: 0, expected: 3 },
      { slot: 2, lh: 30, mid: 0, top: 0, bottom: 634, expected: 1 },
      { slot: 3, lh: 11, mid: 68, top: 5, bottom: 585, expected: 5 },
      { slot: 4, lh: 6, mid: 72, top: 567, bottom: 0, expected: 4 },
      { slot: 128, lh: 35, mid: 59, top: 0, bottom: 605, expected: 3 },
      { slot: 129, lh: 25, mid: 645, top: 0, bottom: 0, expected: 2 },
      { slot: 130, lh: 5, mid: 74, top: 0, bottom: 577, expected: 4 },
      { slot: 131, lh: 8, mid: 128, top: 444, bottom: 75, expected: 5 },
      { slot: 132, lh: 43, mid: 0, top: 662, bottom: 0, expected: 1 },
    ];
    const players = observed.map(({ slot, lh, mid, top, bottom }) => ({
      player_slot: slot,
      lane_pos: { "128": { "128": mid }, "90": { "165": top }, "165": { "90": bottom } },
      lh_t: Array.from({ length: 11 }, (_, minute) => Math.round(lh * minute / 10)),
    }));
    const result = resolveMatchPositions({ players, profileSlot: null, profileAssignedPosition: null });
    expect(observed.map(({ slot }) => result.get(slot)?.detectedPosition)).toEqual(observed.map(({ expected }) => expected));
    expect([...result.values()].every((entry) => entry.evidence?.some((signal) => signal.key.startsWith("replay-")))).toBe(true);
  });

  it("identifies the lane pairing and core/support roles in both teams, even when a mid buys wards", () => {
    const players = [
      player(0, "mid", 9, 3),       // Mirana, radiant mid
      player(1, "top", 42, 0),      // Magnus, radiant offlane
      player(2, "bottom", 52, 0),   // Spectre, radiant safe lane
      player(3, "bottom", 4, 4),    // Dazzle, radiant hard support
      player(4, "top", 5, 2),       // Ogre, radiant soft support
      player(128, "bottom", 46, 0), // Axe, dire offlane
      player(129, "mid", 49, 4),    // Slark, dire mid
      player(130, "bottom", 4, 2),  // Witch Doctor, dire soft support
      player(131, "top", 3, 3),     // Bane, dire hard support
      player(132, "top", 48, 0),    // Medusa, dire safe lane
    ];
    const result = resolveMatchPositions({ players, profileSlot: null, profileAssignedPosition: null });
    expect(players.map((entry) => result.get(entry.player_slot)?.detectedPosition)).toEqual([2, 3, 1, 5, 4, 3, 2, 4, 5, 1]);
    expect(result.get(0)?.evidence?.some((entry) => entry.key === "replay-mid")).toBe(true);
    expect(result.get(0)?.source).toBe("heuristic");
  });

  it("leaves a position unknown when only total-match GPM and indistinguishable LH remain", () => {
    const players = [0, 1, 2, 3, 4].map((slot) => ({
      player_slot: slot, gold_per_min: 700,
      lh_t: Array.from({ length: 11 }, () => 40),
    }));
    const result = resolveMatchPositions({ players, profileSlot: null, profileAssignedPosition: null });
    expect([...result.values()].every((entry) => entry.detectedPosition === null && entry.source === "unknown")).toBe(true);
  });

  it("keeps user confirmed positions ahead of lane inference", () => {
    const result = resolveMatchPositions({
      players: [player(0, "mid", 5, 0)],
      positionOverrides: { "0": 4 }, profileSlot: 0, profileAssignedPosition: 2,
    });
    expect(result.get(0)).toMatchObject({ detectedPosition: 4, confirmedPosition: 4, confidence: 100, source: "manual", roleSwapDetected: false });
  });
});
