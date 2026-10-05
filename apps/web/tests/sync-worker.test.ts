import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireSyncWorkerSecret } from "../lib/sync/auth";
import { getSyncWorkerConfig } from "../lib/sync/config";
import { SyncWorkerError } from "../lib/sync/errors";
import { selectRecentSyncMatches } from "../lib/opendota/recent";
import { scheduledSyncUserFromJob } from "../lib/sync/job";

const ENV_NAMES = [
  "SYNC_WORKER_SECRET",
  "SCHEDULED_SYNC_ENABLED",
  "SCHEDULED_SYNC_INTERVAL_SECONDS",
  "SCHEDULED_SYNC_ENQUEUE_BATCH_SIZE",
  "SCHEDULED_SYNC_PROCESS_BATCH_SIZE",
  "SCHEDULED_SYNC_STALE_LOCK_SECONDS",
  "SCHEDULED_SYNC_MAX_ATTEMPTS",
  "SCHEDULED_SYNC_RETRY_BASE_SECONDS",
  "SCHEDULED_SYNC_LOOKBACK_SECONDS",
  "SCHEDULED_SYNC_INITIAL_MATCHES",
] as const;
const originalEnv = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);
const SECRET = "scheduled-sync-test-secret-1234567890";

beforeEach(() => {
  ENV_NAMES.forEach((name) => delete process.env[name]);
  process.env.SYNC_WORKER_SECRET = SECRET;
});

afterEach(() => {
  ENV_NAMES.forEach((name) => {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

describe("scheduled sync worker configuration", () => {
  it("uses conservative queue and retry defaults", () => {
    expect(getSyncWorkerConfig()).toEqual({
      secret: SECRET,
      enabled: false,
      intervalSeconds: 3_600,
      enqueueBatchSize: 25,
      processBatchSize: 1,
      staleLockSeconds: 900,
      maxAttempts: 3,
      retryBaseSeconds: 60,
      lookbackSeconds: 21_600,
      initialMatches: 1,
    });
  });

  it("supports an explicit on/off switch and rejects ambiguous values", () => {
    process.env.SCHEDULED_SYNC_ENABLED = "on";
    expect(getSyncWorkerConfig().enabled).toBe(true);

    process.env.SCHEDULED_SYNC_ENABLED = "off";
    expect(getSyncWorkerConfig().enabled).toBe(false);

    process.env.SCHEDULED_SYNC_ENABLED = "sometimes";
    expect(() => getSyncWorkerConfig()).toThrow("SCHEDULED_SYNC_ENABLED");
  });

  it("rejects weak secrets and unsafe batch sizes", () => {
    process.env.SYNC_WORKER_SECRET = "short";
    expect(() => getSyncWorkerConfig()).toThrow("SYNC_WORKER_SECRET");

    process.env.SYNC_WORKER_SECRET = SECRET;
    process.env.SCHEDULED_SYNC_PROCESS_BATCH_SIZE = "11";
    expect(() => getSyncWorkerConfig()).toThrow(
      "SCHEDULED_SYNC_PROCESS_BATCH_SIZE",
    );
  });
});

describe("scheduled sync worker authentication", () => {
  it("accepts only the exact Bearer secret", () => {
    const validRequest = new NextRequest("http://localhost/api/internal/sync/tick", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(() => requireSyncWorkerSecret(validRequest)).not.toThrow();

    const invalidRequest = new NextRequest(
      "http://localhost/api/internal/sync/tick",
      { headers: { Authorization: `Bearer ${SECRET}x` } },
    );
    expect(() => requireSyncWorkerSecret(invalidRequest)).toThrow(
      SyncWorkerError,
    );
  });
});

describe("scheduled sync lookback policy", () => {
  const matches = [300, 200, 100].map((start_time, index) => ({
    match_id: 9_000_000_000 - index,
    player_slot: 0,
    radiant_win: true,
    duration: 2_000,
    hero_id: 1,
    start_time,
  }));

  it("limits a never-synced account to the configured initial import", () => {
    const selection = selectRecentSyncMatches(matches, {
      maxNewMatches: 3,
      initialMatches: 1,
    });
    expect(selection.candidates.map((match) => match.start_time)).toEqual([300]);
    expect(selection.ignoredOlder).toBe(2);
  });

  it("keeps a lookback overlap and orders selected matches chronologically", () => {
    const selection = selectRecentSyncMatches(matches, {
      maxNewMatches: 3,
      since: new Date(250_000),
      lookbackSeconds: 100,
    });
    expect(selection.candidates.map((match) => match.start_time)).toEqual([
      200,
      300,
    ]);
    expect(selection.ignoredOlder).toBe(1);
  });
});

describe("scheduled job identity mapping", () => {
  it("passes the owner user id instead of the sync job id", () => {
    const user = scheduledSyncUserFromJob({
      userId: "91204564-b0a4-412d-8545-9cc6d4d79621",
      steamAccountId: 988_195_076,
      lastManualSyncAt: null,
      lastScheduledSyncAt: null,
    });

    expect(user.id).toBe("91204564-b0a4-412d-8545-9cc6d4d79621");
    expect(user).not.toHaveProperty("jobId");
  });
});
