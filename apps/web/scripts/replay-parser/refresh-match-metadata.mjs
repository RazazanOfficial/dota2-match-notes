import { replayDescriptor } from "./replay-queue-utils.mjs";
import { ReplayError } from "./replay-transport.mjs";

const MAX_BYTES = 8 * 1024 * 1024;

// The full match endpoint is reached from the VPS, independently of the
// Cloudflare relay. A stale match stored before Valve prepared its replay must
// not force every subsequent attempt through the same rate-limited relay.
export async function refreshMatchMetadata(matchId, options = {}) {
  const env = options.env || process.env;
  const base = new URL(env.OPENDOTA_API_BASE_URL || "https://api.opendota.com/api");
  if (base.protocol !== "https:" || base.search || base.hash) throw new ReplayError("replay_metadata_config_invalid", "Invalid OpenDota endpoint", { retryable: false });
  const url = new URL(`${base.toString().replace(/\/+$/, "")}/matches/${matchId}`);
  if (env.OPENDOTA_API_KEY?.trim()) url.searchParams.set("api_key", env.OPENDOTA_API_KEY.trim());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await (options.fetch || fetch)(url, { headers: { Accept: "application/json" }, redirect: "error", signal: controller.signal });
    if (response.status === 429) throw new ReplayError("replay_metadata_rate_limited", "OpenDota rate limited the full match", { retryAfter: 600 });
    if (response.status === 404) throw new ReplayError("replay_metadata_pending", "Full match is not available yet", { retryAfter: 600 });
    if (!response.ok) throw new ReplayError("replay_metadata_unavailable", "Full match request failed", { retryAfter: 600 });
    if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) throw new ReplayError("replay_metadata_invalid", "Full match response too large", { retryable: false });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) throw new ReplayError("replay_metadata_invalid", "Full match response too large", { retryable: false });
    let match;
    try { match = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new ReplayError("replay_metadata_unavailable", "Full match response was invalid", { retryAfter: 600 }); }
    if (match?.match_id !== matchId) throw new ReplayError("replay_metadata_invalid", "Full match ID differed", { retryable: false });
    return replayDescriptor(match, matchId);
  } finally { clearTimeout(timer); await response?.body?.cancel().catch(() => {}); }
}
