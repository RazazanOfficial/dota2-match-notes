import { describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  claimNextScheduledSyncJob: vi.fn(),
  completeScheduledSyncJob: vi.fn(),
  enqueueDueScheduledSyncJobs: vi.fn(),
  recoverStaleScheduledJobs: vi.fn(),
  rescheduleOrFailScheduledSyncJob: vi.fn(),
}));
const syncScheduledMatchesFromOpenDota = vi.hoisted(() => vi.fn());

vi.mock("../lib/sync/config", () => ({
  getSyncWorkerConfig: () => ({
    secret: "scheduled-sync-test-secret-1234567890",
    enabled: false,
    intervalSeconds: 3_600,
    enqueueBatchSize: 25,
    processBatchSize: 1,
    staleLockSeconds: 900,
    maxAttempts: 3,
    retryBaseSeconds: 60,
    lookbackSeconds: 21_600,
    initialMatches: 1,
  }),
}));
vi.mock("../lib/sync/repository", () => repository);
vi.mock("@/lib/opendota/service", () => ({
  syncScheduledMatchesFromOpenDota,
}));
vi.mock("@/lib/opendota/errors", () => ({
  OpenDotaError: class OpenDotaError extends Error {},
}));
vi.mock("../lib/sync/job", () => ({
  scheduledSyncUserFromJob: vi.fn(),
}));

import { runScheduledSyncTick } from "../lib/sync/service";

describe("scheduled sync toggle", () => {
  it("does not enqueue jobs or call OpenDota while disabled", async () => {
    await expect(runScheduledSyncTick()).resolves.toEqual({
      enabled: false,
      enqueued: 0,
      stale: { recovered: 0, failed: 0 },
      processed: 0,
      stoppedEarly: false,
      jobs: [],
    });

    expect(repository.recoverStaleScheduledJobs).not.toHaveBeenCalled();
    expect(repository.enqueueDueScheduledSyncJobs).not.toHaveBeenCalled();
    expect(repository.claimNextScheduledSyncJob).not.toHaveBeenCalled();
    expect(syncScheduledMatchesFromOpenDota).not.toHaveBeenCalled();
  });
});
