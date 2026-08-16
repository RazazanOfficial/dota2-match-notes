import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMatchImageJobConfig } from "../lib/match-image-job/config";
import { describeMatchImageJobError } from "../lib/match-image-job/policy";
import { MatchImageError } from "../lib/match-image/errors";
import { MediaError } from "../lib/media/errors";

const ENV_NAMES = [
  "MATCH_IMAGE_PROCESS_BATCH_SIZE",
  "MATCH_IMAGE_STALE_LOCK_SECONDS",
  "MATCH_IMAGE_MAX_ATTEMPTS",
  "MATCH_IMAGE_RETRY_BASE_SECONDS",
] as const;
const originalEnv = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  ENV_NAMES.forEach((name) => delete process.env[name]);
});

afterEach(() => {
  ENV_NAMES.forEach((name) => {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

describe("match image job configuration", () => {
  it("uses conservative single-job and retry defaults", () => {
    expect(getMatchImageJobConfig()).toEqual({
      processBatchSize: 1,
      staleLockSeconds: 900,
      maxAttempts: 3,
      retryBaseSeconds: 60,
    });
  });

  it("rejects unsafe rendering concurrency", () => {
    process.env.MATCH_IMAGE_PROCESS_BATCH_SIZE = "4";
    expect(() => getMatchImageJobConfig()).toThrow(
      "MATCH_IMAGE_PROCESS_BATCH_SIZE",
    );
  });
});

describe("match image job failure policy", () => {
  it("retries temporary storage failures", () => {
    expect(
      describeMatchImageJobError(
        new MediaError(502, "storage_unavailable", "temporary"),
      ),
    ).toMatchObject({ code: "storage_unavailable", permanent: false });
  });

  it("does not retry permanent image model failures", () => {
    expect(
      describeMatchImageJobError(
        new MatchImageError("image_player_not_found", "invalid source"),
      ),
    ).toMatchObject({ code: "image_player_not_found", permanent: true });
  });
});
