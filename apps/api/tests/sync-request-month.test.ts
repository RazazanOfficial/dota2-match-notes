import { afterEach, describe, expect, it, vi } from "vitest";
import { manualMatchSyncInputSchema } from "../src/lib/opendota/sync-request";

afterEach(() => vi.useRealTimers());

describe("monthly manual sync range", () => {
  it("accepts the elapsed portion of a Persian month across a Gregorian boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const request = { scope: "month", from: "2026-09-23", to: "2026-10-05", mode: "basic" };
    expect(manualMatchSyncInputSchema.safeParse(request).success).toBe(true);
  });

  it("rejects a range spanning two Persian months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const request = { scope: "month", from: "2026-09-22", to: "2026-10-01", mode: "basic" };
    expect(manualMatchSyncInputSchema.safeParse(request).success).toBe(false);
  });

  it("keeps the existing Gregorian month requests valid for the web client", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    expect(manualMatchSyncInputSchema.safeParse({ scope: "month", from: "2026-09-01", to: "2026-09-30", mode: "basic" }).success).toBe(true);
  });
});
