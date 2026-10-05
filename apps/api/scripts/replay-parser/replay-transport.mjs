import https from "node:https";
import { lookup, resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, truncate } from "node:fs/promises";
import { once } from "node:events";
import { MAX_REPLAY_BYTES, replayProxySettings, validateReplayHeader } from "./replay-queue-utils.mjs";

export class ReplayError extends Error {
  constructor(code, message, extra = {}) {
    super(message); this.code = code; this.retryable = true; this.circuit = false;
    Object.assign(this, extra);
  }
}
export const strongEtag = value => typeof value === "string" && /^"[^"\x00-\x20\x7f]{1,250}"$/.test(value) ? value : null;
export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 ||
    a === 198 && (b === 18 || b === 19));
}
function readTransportConfig(env) {
  const primary = replayProxySettings(env);
  if (!primary) throw new ReplayError("replay_proxy_not_configured", "Configure the authenticated replay relay", { retryable: false });
  const origins = [primary.url];
  for (const url of (env.LOCAL_REPLAY_PROXY_FALLBACK_URLS || "").split(",").map(x => x.trim()).filter(Boolean)) {
    origins.push(replayProxySettings({ LOCAL_REPLAY_PROXY_URL: url, LOCAL_REPLAY_PROXY_TOKEN: primary.token }).url);
  }
  const addresses = (env.LOCAL_REPLAY_PROXY_FALLBACK_IPS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (addresses.some(ip => !publicIPv4(ip))) throw new ReplayError("replay_proxy_config_invalid", "Fallback IPs must be public IPv4 addresses", { retryable: false });
  if (origins.length > 3 || addresses.length > 4) throw new ReplayError("replay_proxy_config_invalid", "At most three origins and four fallback IPs are allowed", { retryable: false });
  return { origins: [...new Set(origins)], addresses: [...new Set(addresses)], token: primary.token };
}
export function transportConfig(env = process.env) {
  try { return readTransportConfig(env); }
  catch (error) { if (error instanceof ReplayError) throw error; throw new ReplayError("replay_proxy_config_invalid", "Replay relay URL or token configuration is invalid", { retryable: false }); }
}
export async function resolveAddresses(hostname) {
  // Fresh DNS answers and OS/hosts are both considered; neither is pinned forever.
  const bound = task => Promise.race([task, new Promise(resolve => { const t = setTimeout(() => resolve([]), 3_000); t.unref(); })]);
  const results = await Promise.allSettled([bound(lookup(hostname, { all: true, family: 4 })), bound(resolve4(hostname))]);
  return [...new Set(results.flatMap(r => r.status === "fulfilled" ? r.value.map(v => typeof v === "string" ? v : v.address) : []))].filter(publicIPv4);
}
export async function selectRoutes(config, store = {}, resolver = resolveAddresses, now = Date.now()) {
  const previous = await store.routes?.() || [];
  const groups = await Promise.all(config.origins.map(async endpoint => {
    const records = previous.filter(r => r.endpoint === endpoint);
    const fresh = await resolver(new URL(endpoint).hostname).catch(() => []);
    const cached = records.filter(r => r.last_success_at && now - new Date(r.last_success_at).getTime() < 86_400_000).map(r => r.address);
    const ips = [...new Set([...fresh.slice(0, 1), ...config.addresses, ...fresh.slice(1), ...cached])].filter(publicIPv4);
    return ips.map(address => {
      const old = records.find(r => r.address === address);
      return { endpoint, address, key: `${endpoint}|${address}`, openUntil: new Date(old?.open_until || 0).getTime(), failures: Number(old?.failures || 0), success: new Date(old?.last_success_at || 0).getTime() };
    }).filter(r => r.openUntil <= now).sort((a, b) => a.failures - b.failures || b.success - a.success);
  }));
  // Interleave origins: the second configured origin gets a turn before exhausting the first.
  const routes = [];
  for (let i = 0; i < Math.max(0, ...groups.map(g => g.length)); i++) for (const group of groups) if (group[i]) routes.push(group[i]);
  if (!routes.length) throw new ReplayError(previous.some(r => new Date(r.open_until || 0).getTime() > now) ? "replay_routes_cooling" : "replay_dns_failed", "No relay route is currently available", { circuit: true });
  return routes;
}

// Keep hostname, Host and TLS SNI intact while choosing the connection address.
// No redirect following and no disabling certificate validation.
export function requestRoute(url, route, headers, {
  connectMs = 8_000, headersMs = 20_000, idleMs = 45_000, totalMs = 300_000,
  signal, requestImpl = https.request,
} = {}) {
  return new Promise((resolve, reject) => {
    let received = false;
    const fail = (code, message) => new ReplayError(code, message, { circuit: true });
    const req = requestImpl(url, {
      method: "GET", agent: false, headers, signal,
      servername: new URL(url).hostname, rejectUnauthorized: true,
      lookup: (_host, options, cb) => options?.all ? cb(null, [{ address: route.address, family: 4 }]) : cb(null, route.address, 4),
    });
    const timers = [];
    const arm = (ms, error) => { const timer = setTimeout(() => req.destroy(error), ms); timers.push(timer); return timer; };
    const connect = arm(connectMs, fail("replay_connect_timeout", "Relay connection timed out"));
    const header = arm(headersMs, fail("replay_headers_timeout", "Relay response headers timed out"));
    arm(totalMs, fail("replay_total_timeout", "Replay transfer exceeded its time budget"));
    const cleanup = () => timers.forEach(clearTimeout);
    req.once("socket", socket => { socket.once("secureConnect", () => clearTimeout(connect)); });
    req.once("response", res => {
      received = true; clearTimeout(connect); clearTimeout(header);
      res.setTimeout(idleMs, () => res.destroy(fail("replay_body_timeout", "Replay transfer stopped receiving data")));
      res.once("close", cleanup);
      // Install before handing the stream to async persistence hooks.
      res.on("error", () => {});
      resolve({ status: res.statusCode, headers: new Headers(Object.entries(res.headers).filter(([,v]) => v !== undefined).map(([k,v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)])), body: res, close: () => { cleanup(); res.destroy(); } });
    });
    req.once("error", error => {
      cleanup();
      if (!received) reject(error instanceof ReplayError ? error : fail("replay_connect_failed", `Relay connection failed (${/^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "network"})`));
    });
    req.end();
  });
}
function retryAfter(value) {
  if (!value) return null;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.min(86_400, Math.max(1, seconds)) : null;
}
export function responseError(response) {
  const status = response.status;
  const source = response.headers.get("x-replay-error-source") || "edge";
  const code = status === 401 ? "replay_proxy_auth_failed" : status === 403 ? (source === "valve" ? "valve_access_blocked" : "replay_relay_forbidden")
    : status === 404 ? "replay_not_found" : status === 429 ? "replay_rate_limited"
      : status === 413 ? "replay_too_large" : status >= 300 && status < 400 ? "replay_redirect_rejected"
        : source === "valve" ? "replay_valve_unavailable" : "replay_relay_unavailable";
  return new ReplayError(code, `${source} returned HTTP ${status}`, {
    httpStatus: status, errorSource: source, retryAfter: retryAfter(response.headers.get("retry-after")),
    retryable: status !== 401 && status !== 413 && !(status >= 300 && status < 400),
    circuit: source === "edge" && status >= 500,
  });
}
export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

// Durable checkpoint is owned by the queue lease. Only strong ETags allow resume.
export async function downloadResilient(descriptor, path, checkpoint, config, hooks = {}, options = {}) {
  const routes = await selectRoutes(config, hooks, options.resolver, options.now?.() ?? Date.now());
  const request = options.request || requestRoute;
  const now = options.now || Date.now;
  const size = (await lstat(path).catch(e => { if (e.code === "ENOENT") return null; throw e; }))?.size || 0;
  let offset = size, etag = strongEtag(checkpoint.etag), total = checkpoint.total || null;
  let last;
  const maxAttempts = options.maxAttempts ?? 3;
  const blocked = new Set();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const eligible = routes.filter(route => !blocked.has(route.endpoint));
    if (!eligible.length) break;
    const route = eligible[attempt % eligible.length];
    const requestId = randomUUID();
    let response, added = 0, lastProgress = now(), intervalBytes = 0;
    const started = now();
    try {
      if (offset && (!etag || !total || offset >= total)) { await truncate(path, 0); offset = 0; etag = null; total = null; }
      await hooks.phase?.("connecting", { endpoint: route.endpoint, address: route.address });
      await hooks.event?.("connecting", "route_attempt", `Attempt ${attempt + 1}; request ${requestId}`, route);
      response = await request(`${route.endpoint}/v1/replay/${descriptor.cluster}/${descriptor.matchId}/${descriptor.salt}`, route, {
        Authorization: `Bearer ${config.token}`, "User-Agent": "Dota2Notes-ReplayWorker/2", "X-Replay-Request-Id": requestId,
        ...(offset ? { Range: `bytes=${offset}-`, "If-Range": etag } : {}),
      }, options.requestOptions);
      if (![200, 206].includes(response.status)) throw responseError(response);
      const lengthHeader = response.headers.get("content-length");
      const length = lengthHeader === null ? null : /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : NaN;
      if (length !== null && (!Number.isSafeInteger(length) || length > MAX_REPLAY_BYTES)) throw new ReplayError("replay_too_large", "Replay exceeds the size limit", { retryable: false });
      const nextEtag = strongEtag(response.headers.get("etag"));
      if (response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
        if (!offset || !range || Number(range[1]) !== offset || Number(range[2]) !== Number(range[3]) - 1 ||
          Number(range[3]) !== total || total > MAX_REPLAY_BYTES || nextEtag !== etag || length !== total - offset) {
          throw new ReplayError("replay_range_invalid", "Replay resume response did not match the checkpoint", { discard: true });
        }
      } else {
        // If-Range mismatch or a server ignoring Range: replace, never append.
        offset = 0; etag = nextEtag; total = length;
      }
      await hooks.checkpoint?.({ etag, total, complete: false });
      await hooks.phase?.("downloading", route);
      const output = createWriteStream(path, { flags: offset ? "a" : "w", mode: 0o600 });
      output.on("error", () => {});
      try {
        for await (const chunk of response.body) {
          if (offset + added + chunk.length > MAX_REPLAY_BYTES || total !== null && offset + added + chunk.length > total) {
            throw new ReplayError("replay_size_invalid", "Replay response exceeded its declared size", { discard: true });
          }
          if (!output.write(chunk)) await once(output, "drain");
          added += chunk.length; intervalBytes += chunk.length;
          const elapsed = now() - lastProgress;
          if (elapsed >= 2_000) {
            await hooks.progress?.({ bytes: offset + added, total, delta: intervalBytes, bps: Math.round(intervalBytes * 1000 / elapsed) });
            intervalBytes = 0; lastProgress = now();
          }
        }
        output.end(); await once(output, "finish");
      } finally { output.destroy(); if (!output.closed) await new Promise(resolve => output.once("close", resolve)); }
      if (offset + added < 8 || total !== null && offset + added !== total) throw new ReplayError("replay_body_incomplete", "Replay response ended before the complete file arrived");
      await hooks.phase?.("validating", route);
      try { await validateReplayHeader(path); } catch { throw new ReplayError("replay_payload_invalid", "Response was not a replay file", { discard: true }); }
      total = offset + added;
      const hash = await sha256File(path);
      await hooks.checkpoint?.({ etag, total: offset + added, complete: true, sha256: hash });
      await hooks.routeSuccess?.(route);
      await hooks.event?.("validating", "download_complete", `Verified ${offset + added} bytes in ${now() - started}ms`, { ...route, bytes: added, httpStatus: response.status });
      return { path, source: "proxy", bytes: offset + added, sha256: hash };
    } catch (error) {
      if (error?.code === "replay_lease_lost" || options.requestOptions?.signal?.aborted) throw error;
      last = error instanceof ReplayError ? error : new ReplayError("replay_body_interrupted", "Replay stream was interrupted", { circuit: error?.code !== "ENOSPC" });
      if (error?.code === "ENOSPC") last = new ReplayError("replay_disk_full", "Insufficient disk space");
      if (last.circuit) await hooks.routeFailure?.(route, last.code);
      await hooks.event?.("downloading", last.code, last.message, { ...route, httpStatus: last.httpStatus, bytes: added });
      if (last.discard) {
        await truncate(path, 0).catch(e => { if (e.code !== "ENOENT") throw e; });
        etag = null; total = null;
        await hooks.checkpoint?.({ etag: null, total: null, complete: false });
      }
      offset = (await lstat(path).catch(() => null))?.size || 0;
      if (last.httpStatus === 429) blocked.add(route.endpoint);
      if (!last.retryable) throw last;
    } finally {
      response?.close?.();
      if (intervalBytes) await hooks.progress?.({ bytes: (await lstat(path).catch(() => null))?.size || 0, total, delta: intervalBytes, bps: 0 });
    }
  }
  throw last || new ReplayError("replay_routes_cooling", "Relay routes are temporarily unavailable");
}
