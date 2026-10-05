import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { fetchReplayMetadata } from "../scripts/replay-parser/replay-metadata.mjs";

const config = { origins: ["https://relay.example.org"], addresses: ["188.114.99.0"], token: "a".repeat(64) };
const original = { match_id: 9020830802, cluster: 436, players: [{ hero_id: 1 }] };
const route = { endpoint: config.origins[0], address: config.addresses[0] };
const hooks = () => ({ event: vi.fn(), routeSuccess: vi.fn(), routeFailure: vi.fn(), routes: async () => [] });
function response(status, body = "", headers = {}) {
  return { status, body: Readable.from([Buffer.from(body)]), headers: new Headers(headers), close: vi.fn() };
}

describe("on-demand replay metadata recovery", () => {
  it("accepts exact ID and valid salt, using the known cluster", async () => {
    const tracking = hooks();
    const request = vi.fn(async () => response(200, JSON.stringify({ match_id: 9020830802, cluster: null, replay_salt: 12345 })));
    expect(await fetchReplayMetadata(9020830802, original, config, tracking, {
      resolver: async () => [route.address], request,
    })).toEqual({ cluster: 436, salt: 12345 });
    expect(request.mock.calls[0][0]).toBe("https://relay.example.org/v1/metadata/9020830802");
    expect(tracking.routeSuccess).toHaveBeenCalledTimes(1);
  });

  it("waits after a missing salt without marking the relay address broken", async () => {
    const tracking = hooks();
    await expect(fetchReplayMetadata(9020830802, original, config, tracking, {
      resolver: async () => [route.address], request: async () => response(404),
    })).rejects.toMatchObject({ code: "replay_metadata_pending", retryAfter: 300 });
    expect(tracking.routeFailure).not.toHaveBeenCalled();
  });

  it("rejects metadata from a different match or an invalid salt", async () => {
    for (const data of [{ match_id: 42, cluster: 436, replay_salt: 123 },
      { match_id: 9020830802, cluster: 436, replay_salt: "not-a-salt" }]) {
      await expect(fetchReplayMetadata(9020830802, original, config, hooks(), {
        resolver: async () => [route.address], request: async () => response(200, JSON.stringify(data)),
      })).rejects.toMatchObject({ code: "replay_metadata_invalid" });
    }
  });
});
