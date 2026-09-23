import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../lib/auth/session";

const mocks = vi.hoisted(() => ({
  quota: vi.fn(),
  history: vi.fn(),
  known: vi.fn(),
  completed: vi.fn(),
  claim: vi.fn(),
}));

vi.mock("../lib/opendota/client", () => ({
  fetchOpenDotaPlayerMatchesSince: mocks.history,
}));
vi.mock("../lib/opendota/repository", () => ({
  claimOpenDotaRequestQuota: mocks.quota,
  claimManualOpenDotaSync: mocks.claim,
  findKnownOpenDotaMatchIds: mocks.known,
  markJournalRangeCompleted: mocks.completed,
}));
vi.mock("../lib/stratz/config", () => ({
  getStratzConfig: () => ({ backfillOnManualSync: false, inlineProcessBatchSize: 0 }),
}));
vi.mock("../lib/stratz/job-repository", () => ({ enqueueStratzBackfillForUser: vi.fn() }));
vi.mock("../lib/stratz/job-service", () => ({ runStratzEnrichmentTick: vi.fn() }));
vi.mock("../lib/opendota-parse/repository", () => ({ requestOpenDotaAnalysisRange: vi.fn() }));

import { syncRecentMatchesFromOpenDota } from "../lib/opendota/service";

const user = {
  id: "test-user",
  steamAccountId: 123,
  createdAt: new Date("2026-09-01T00:00:00Z"),
} as SessionUser;
const request = { scope: "day", from: "2026-09-13", to: "2026-09-13", mode: "basic" } as const;
const match = (id: number, date: string) => ({
  match_id: id, start_time: Date.parse(`${date}T12:00:00Z`) / 1_000,
  player_slot: 0, hero_id: 1, duration: 1800, radiant_win: true,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claim.mockResolvedValue(new Date());
  mocks.known.mockImplementation(async (_userId: string, ids: number[]) => ({
    importedIds: new Set(ids), dismissedIds: new Set<number>(),
  }));
});

describe("manual selected range sync", () => {
  it("counts only the chosen day and reserves quota for each history page", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => match(index + 10, "2026-09-14"));
    mocks.history.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([
      match(1, "2026-09-13"), match(2, "2026-09-12"),
    ]);

    const result = await syncRecentMatchesFromOpenDota(user, request);
    expect(result.checked).toBe(1);
    expect(mocks.known).toHaveBeenCalledWith(user.id, [1]);
    expect(mocks.history).toHaveBeenNthCalledWith(2, 123, expect.any(Date), 100, 100);
    expect(mocks.quota).toHaveBeenCalledTimes(2);
    expect(mocks.completed).toHaveBeenCalledWith(user.id, request.from, request.to);
  });

  it("does not mark an unscanned day complete when history exceeds the page cap", async () => {
    mocks.history.mockResolvedValue(Array.from({ length: 100 }, (_, index) => match(index + 10, "2026-09-14")));
    await expect(syncRecentMatchesFromOpenDota(user, request)).rejects.toMatchObject({ code: "opendota_history_too_large" });
    expect(mocks.quota).toHaveBeenCalledTimes(30);
    expect(mocks.completed).not.toHaveBeenCalled();
  });
});
