import { describe, expect, it } from "vitest";
import {
  ANALYSIS_TOKEN_COST,
  matchAnalysisStatus,
  replayAgeState,
} from "../lib/opendota/analysis-policy";
import { manualMatchSyncInputSchema, matchesSyncGameMode, saturdayWeekStart } from "../lib/opendota/sync-request";

describe("controlled replay analysis policy", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");

  it("keeps the in-site token value separate and stable", () => {
    expect(ANALYSIS_TOKEN_COST).toBe(10);
  });

  it("warns after ten days and blocks a new request after twenty days", () => {
    expect(replayAgeState("2026-09-04T12:00:00.000Z", now)).toBe("fresh");
    expect(replayAgeState("2026-09-02T12:00:00.000Z", now)).toBe("warning");
    expect(replayAgeState("2026-08-23T12:00:00.000Z", now)).toBe("expired");
  });

  it("prefers parsed and active job states over age labels", () => {
    expect(matchAnalysisStatus({ replayParsed: true, parseStatus: null, startedAt: "2026-01-01", now })).toBe("ready");
    expect(matchAnalysisStatus({ replayParsed: false, parseStatus: "processing", startedAt: "2026-01-01", now })).toBe("processing");
    expect(matchAnalysisStatus({ replayParsed: false, parseStatus: null, startedAt: "2026-01-01", now })).toBe("expired");
  });
});

describe("manual match range validation", () => {
  it("starts tracking at Saturday 00:00 of the registration week", () => {
    expect(saturdayWeekStart("2026-09-15")).toBe("2026-09-12");
    expect(saturdayWeekStart("2026-09-12")).toBe("2026-09-12");
  });

  it("accepts one day, a full week, or the elapsed part of the current week", () => {
    expect(manualMatchSyncInputSchema.safeParse({ scope: "day", from: "2026-09-13", to: "2026-09-13", mode: "basic" }).success).toBe(true);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "week", from: "2026-09-12", to: "2026-09-18", mode: "basic" }).success).toBe(true);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "week", from: "2026-09-12", to: "2026-09-16", mode: "basic" }).success).toBe(true);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "day", from: "2026-09-13", to: "2026-09-13", mode: "analysis" }).success).toBe(false);
  });

  it("filters imported matches by the selected real game mode", () => {
    expect(matchesSyncGameMode(["ranked"], 22, 7)).toBe(true);
    expect(matchesSyncGameMode(["all_pick"], 22, 7)).toBe(false);
    expect(matchesSyncGameMode(["all_pick"], 22, 0)).toBe(true);
    expect(matchesSyncGameMode(["turbo"], 23, 0)).toBe(true);
    expect(matchesSyncGameMode(["captains"], 2, 2)).toBe(true);
    expect(matchesSyncGameMode(["other"], 4, 0)).toBe(true);
  });

  it("accepts unique mode filters and rejects an empty or duplicated selection", () => {
    const base = { scope: "day", from: "2026-09-13", to: "2026-09-13", mode: "basic" } as const;
    expect(manualMatchSyncInputSchema.safeParse({ ...base, gameModes: ["ranked", "turbo"] }).success).toBe(true);
    expect(manualMatchSyncInputSchema.safeParse({ ...base, gameModes: [] }).success).toBe(false);
    expect(manualMatchSyncInputSchema.safeParse({ ...base, gameModes: ["ranked", "ranked"] }).success).toBe(false);
  });

  it("rejects a mismatched scope and range", () => {
    expect(manualMatchSyncInputSchema.safeParse({ scope: "day", from: "2026-09-12", to: "2026-09-13", mode: "basic" }).success).toBe(false);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "week", from: "2026-09-11", to: "2026-09-13", mode: "basic" }).success).toBe(false);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "week", from: "2026-09-12", to: "2026-09-19", mode: "basic" }).success).toBe(false);
  });

  it("rejects days beyond today in the journal time zone", () => {
    const tomorrow = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "day", from: tomorrow, to: tomorrow, mode: "basic" }).success).toBe(false);
  });
});
