import { describe, expect, it, vi } from "vitest";
import { refreshMatchMetadata } from "../scripts/replay-parser/refresh-match-metadata.mjs";
import { retryDecision } from "../scripts/replay-parser/replay-job-policy.mjs";
import { normalizedReplayRaw, preserveVerifiedReplayRaw } from "../src/lib/replay/metadata-fields.ts";

const matchId = 9023606320;
const env = { OPENDOTA_API_BASE_URL: "https://api.example.test/api", OPENDOTA_API_KEY: "private-key" };

describe("fresh replay metadata after an early basic match", () => {
  it("gets the full match from the VPS and constructs one validated replay descriptor", async () => {
    const fetch = vi.fn(async () => Response.json({ match_id: matchId, cluster: 271, replay_salt: 349414436 }));
    const descriptor = await refreshMatchMetadata(matchId, { env, fetch });
    expect(descriptor).toMatchObject({ matchId, cluster: 271, salt: 349414436 });
    expect(fetch.mock.calls[0][0].toString()).toBe(`https://api.example.test/api/matches/${matchId}?api_key=private-key`);
  });

  it("does not persist a partial or inconsistent replay tuple", () => {
    const base = { match_id: matchId, cluster: 271, replay_salt: null, replay_url: null, duration: 2400 };
    expect(normalizedReplayRaw(base, matchId)).toEqual({ match_id: matchId, duration: 2400 });
    expect(normalizedReplayRaw({ ...base, replay_salt: 349414436, replay_url: "http://replay272.valve.net/570/9023606320_349414436.dem.bz2" }, matchId))
      .toEqual({ match_id: matchId, duration: 2400 });
    expect(normalizedReplayRaw({ ...base, replay_salt: 349414436 }, matchId)).toMatchObject({
      cluster: 271, replay_salt: 349414436,
      replay_url: "http://replay271.valve.net/570/9023606320_349414436.dem.bz2",
    });
    const ready = normalizedReplayRaw({ ...base, replay_salt: 349414436 }, matchId);
    expect(preserveVerifiedReplayRaw(base, ready, matchId)).toMatchObject({
      cluster: 271, replay_salt: 349414436, replay_url: ready.replay_url,
    });
  });

  it("keeps the original job eligible and retries metadata after ten minutes", () => {
    const now = Date.now();
    const decision = retryDecision({ code: "replay_metadata_rate_limited" },
      { attempts: 1, retry_deadline_at: new Date(now + 20 * 86_400_000) }, now);
    expect(decision).toEqual({ status: "pending", code: "replay_metadata_rate_limited", delay: 600 });
  });
});
