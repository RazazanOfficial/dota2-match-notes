import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../src/lib/auth/session";
import { OpenDotaError } from "../src/lib/opendota/errors";

const mocks = vi.hoisted(() => ({
  quota: vi.fn(),
  history: vi.fn(),
  detail: vi.fn(),
  save: vi.fn(),
  known: vi.fn(),
  completed: vi.fn(),
  claim: vi.fn(),
}));

vi.mock("../src/lib/opendota/client", () => ({
  fetchOpenDotaPlayerMatchesSince: mocks.history,
  fetchOpenDotaMatch: mocks.detail,
}));
vi.mock("../src/lib/opendota/repository", () => ({
  claimOpenDotaRequestQuota: mocks.quota,
  claimManualOpenDotaSync: mocks.claim,
  findKnownOpenDotaMatchIds: mocks.known,
  markJournalRangeCompleted: mocks.completed,
  saveDiscoveredOpenDotaMatch: mocks.save,
}));
vi.mock("../src/lib/stratz/config", () => ({
  getStratzConfig: () => ({ backfillOnManualSync: false, inlineProcessBatchSize: 0 }),
}));
vi.mock("../src/lib/stratz/job-repository", () => ({ enqueueStratzBackfillForUser: vi.fn() }));
vi.mock("../src/lib/stratz/job-service", () => ({ runStratzEnrichmentTick: vi.fn() }));
vi.mock("../src/lib/opendota-parse/repository", () => ({ requestOpenDotaAnalysisRange: vi.fn() }));

import { syncRecentMatchesFromOpenDota, syncManualRangeBatch } from "../src/lib/opendota/service";

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
    mocks.claim.mockResolvedValue(new Date("2026-10-01T00:00:00Z"));
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
    expect(mocks.claim).toHaveBeenCalledWith(user.id, 90, "day");
    expect(result.nextAllowedAt).toBe("2026-10-01T00:01:30.000Z");
  });

  it("returns the monthly cooldown time for a monthly request", async () => {
    mocks.claim.mockResolvedValue(new Date("2026-10-01T00:00:00Z"));
    mocks.history.mockResolvedValue([]);
    const month = { scope: "month", from: "2026-09-01", to: "2026-09-30", mode: "basic" } as const;
    const result = await syncRecentMatchesFromOpenDota(user, month);
    expect(mocks.claim).toHaveBeenCalledWith(user.id, 7_200, "month");
    expect(result.nextAllowedAt).toBe("2026-10-01T02:00:00.000Z");
  });

  it("does not mark an unscanned day complete when history exceeds the page cap", async () => {
    mocks.history.mockResolvedValue(Array.from({ length: 100 }, (_, index) => match(index + 10, "2026-09-14")));
    await expect(syncRecentMatchesFromOpenDota(user, request)).rejects.toMatchObject({ code: "opendota_history_too_large" });
    expect(mocks.quota).toHaveBeenCalledTimes(30);
    expect(mocks.completed).not.toHaveBeenCalled();
  });

  it("visits every match beyond 20 and verifies Turbo when its compact mode is missing", async () => {
    const matches = Array.from({ length: 28 }, (_, index) => ({ ...match(9_000_000_000 + index, "2026-09-13"),
      game_mode: index % 3 === 0 ? null : 23, lobby_type: 0 }));
    mocks.history.mockResolvedValue(matches);
    mocks.known.mockImplementation(async () => ({ importedIds: new Set(), dismissedIds: new Set() }));
    mocks.detail.mockImplementation(async (id: number) => ({ match_id: id, game_mode: 23, lobby_type: 0,
      players: [{ account_id: user.steamAccountId, player_slot: 0, hero_id: 1 }] }));
    mocks.save.mockImplementation(async ({ match: item }: { match: { match_id: number } }) => ({
      created: true, journalMatchId: String(item.match_id), dotaMatchId: item.match_id, day: "2026-09-13",
    }));
    let attempted: number[] = [];
    const imported: number[] = [];
    let remaining: number;
    do {
      const batch = await syncManualRangeBatch(user, { ...request, gameModes: ["turbo"] }, attempted);
      attempted = [...attempted, ...batch.attemptedIds];
      imported.push(...batch.imported.map((item) => item.dotaMatchId));
      remaining = batch.deferred;
    } while (remaining > 0);
    expect(new Set(imported).size).toBe(28);
    expect(attempted).toHaveLength(28);
    expect(mocks.detail).toHaveBeenCalledTimes(28);
  });

  it("retries a rate limited match instead of marking it as attempted", async () => {
    mocks.history.mockResolvedValue([match(41, "2026-09-13")]);
    mocks.known.mockResolvedValue({ importedIds: new Set(), dismissedIds: new Set() });
    mocks.detail.mockRejectedValue(new OpenDotaError(429, "opendota_rate_limited", "Rate limited"));
    await expect(syncManualRangeBatch(user, request, [])).rejects.toMatchObject({ status: 429 });
  });
});
