import { describe, expect, it } from "vitest";
import {
  ANALYSIS_TOKEN_COST,
  matchAnalysisStatus,
  replayAgeState,
} from "../lib/opendota/analysis-policy";
import { manualMatchSyncInputSchema } from "../lib/opendota/sync-request";

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
  it("accepts one day or exactly seven days", () => {
    expect(manualMatchSyncInputSchema.safeParse({ scope: "day", from: "2026-09-13", to: "2026-09-13", mode: "basic" }).success).toBe(true);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "week", from: "2026-09-07", to: "2026-09-13", mode: "analysis" }).success).toBe(true);
  });

  it("rejects a mismatched scope and range", () => {
    expect(manualMatchSyncInputSchema.safeParse({ scope: "day", from: "2026-09-12", to: "2026-09-13", mode: "basic" }).success).toBe(false);
    expect(manualMatchSyncInputSchema.safeParse({ scope: "week", from: "2026-09-08", to: "2026-09-13", mode: "analysis" }).success).toBe(false);
  });
});
