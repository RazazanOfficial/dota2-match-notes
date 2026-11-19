import { describe, expect, it } from "vitest";
import { backfillOptions, needsLaneBackfill } from "../scripts/replay-parser/backfill-lane.mjs";

const current = () => ({ version: 2, snapshotAt: 600, coordinateSystem: "dota-grid",
  snapshots: [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map(slot => ({ slot, time: 600 })),
  combat: [], assists: [], purchases: [], wards: [] });

describe("bounded Lane backfill selection", () => {
  it("accepts exactly one match with an explicit optional force flag", () => {
    expect(backfillOptions(["--match", "9100002201"])).toEqual({ matchId: 9100002201, force: false });
    expect(backfillOptions(["--match", "9100002201", "--force"])).toEqual({ matchId: 9100002201, force: true });
    for (const args of [[], ["--all"], ["--match", "0"], ["--match", "1e3"], ["--match", "1", "--unknown"], ["--match", "9007199254740992"]]) {
      expect(() => backfillOptions(args)).toThrow("Usage:");
    }
  });
  it("skips only current v2 ten-minute data and identifies missing or obsolete Lane events", () => {
    expect(needsLaneBackfill(current())).toBe(false);
    expect(needsLaneBackfill(null)).toBe(true);
    expect(needsLaneBackfill({ ...current(), version: 1 })).toBe(true);
    expect(needsLaneBackfill({ ...current(), snapshotAt: 720 })).toBe(true);
    expect(needsLaneBackfill({ ...current(), coordinateSystem: "canvas" })).toBe(true);
    expect(needsLaneBackfill({ ...current(), assists: undefined })).toBe(true);
    expect(needsLaneBackfill({ ...current(), snapshots: current().snapshots.slice(1) })).toBe(true);
    expect(needsLaneBackfill({ ...current(), snapshots: current().snapshots.map(row => ({ ...row, slot: 0 })) })).toBe(true);
  });
});
