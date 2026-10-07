import { ReplayError, requestRoute, selectRoutes } from "./replay-transport.mjs";
import { replayDescriptor } from "./replay-queue-utils.mjs";

const MAX_RESPONSE_BYTES = 1024;

function retryAfter(value) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 ? Math.min(seconds, 3600) : null;
}

// Use the same authenticated relay and address failover as the replay transfer.
// The relay returns only the match ID, cluster and salt, never an arbitrary URL.
export async function fetchReplayMetadata(matchId, original, config, hooks, options = {}) {
  const routes = await selectRoutes(config, hooks, options.resolver);
  const request = options.request || requestRoute;
  let lastError;
  for (const route of routes.slice(0, 3)) {
    let response;
    try {
      await hooks.event?.("resolving_metadata", "metadata_attempt", "Checking replay information", route);
      response = await request(`${route.endpoint}/v1/metadata/${matchId}`, route, {
        Authorization: `Bearer ${config.token}`,
      }, { connectMs: 4_000, headersMs: 18_000, idleMs: 5_000, totalMs: 21_000, signal: options.signal });
      if (response.status === 401 || response.status === 403) {
        throw new ReplayError("replay_proxy_auth_failed", "Replay relay rejected metadata authorization", { retryable: false });
      }
      if (response.status === 404) {
        await hooks.routeSuccess?.(route);
        throw new ReplayError("replay_metadata_pending", "OpenDota has not supplied replay metadata yet", { retryAfter: 300 });
      }
      if (response.status === 429) {
        await hooks.routeSuccess?.(route);
        throw new ReplayError("replay_metadata_rate_limited", "OpenDota metadata is rate limited", {
          retryAfter: retryAfter(response.headers.get("retry-after")) || 300,
        });
      }
      if (response.status !== 200) {
        if (response.headers.get("x-replay-error-source") === "opendota") {
          await hooks.routeSuccess?.(route);
          throw new ReplayError("replay_metadata_unavailable", "OpenDota metadata is temporarily unavailable", { retryAfter: 60 });
        }
        throw new ReplayError("replay_metadata_unavailable", "OpenDota metadata is temporarily unavailable");
      }
      await hooks.routeSuccess?.(route);
      let bytes = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) throw new ReplayError("replay_metadata_invalid", "Replay metadata response was too large", { retryable: false });
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new ReplayError("replay_metadata_invalid", "Replay metadata response was not JSON", { retryable: false }); }
      const updated = { ...original, cluster: data.cluster ?? original.cluster, replay_salt: data.replay_salt };
      if (data.match_id !== matchId || !replayDescriptor({ ...updated, replay_url: undefined }, matchId)) {
        throw new ReplayError("replay_metadata_invalid", "Replay metadata did not match the requested game", { retryable: false });
      }
      const descriptor = replayDescriptor({ ...updated, replay_url: undefined }, matchId);
      await hooks.event?.("resolving_metadata", "metadata_ready", "Replay metadata found", route);
      return { cluster: descriptor.cluster, salt: descriptor.salt };
    } catch (error) {
      if (error instanceof ReplayError && (error.code === "replay_metadata_pending" ||
        error.code === "replay_metadata_rate_limited" || error.retryAfter || error.retryable === false)) throw error;
      lastError = error;
      await hooks.routeFailure?.(route, error.code || "replay_metadata_unavailable");
    } finally { response?.close(); }
  }
  throw lastError instanceof ReplayError ? lastError : new ReplayError("replay_metadata_unavailable", "No replay metadata route responded");
}
