import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, open, readdir, rm } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const MAX_REPLAY_BYTES = 200 * 1024 * 1024;
const MAX_ID = Number.MAX_SAFE_INTEGER;

function positiveInteger(value, max = MAX_ID) {
  const n = Number(value);
  return (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value)) &&
    Number.isSafeInteger(n) && n > 0 && n <= max ? n : null;
}

// Never fetch an arbitrary replay_url supplied by a provider or a user.
// Its hostname, path and identifiers must agree with this match.
export function replayDescriptor(raw, expectedMatchId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
    positiveInteger(expectedMatchId) === null || raw.match_id !== expectedMatchId) return null;

  let cluster = positiveInteger(raw.cluster, 9_999);
  let salt = positiveInteger(raw.replay_salt);
  if (typeof raw.replay_url === "string" && raw.replay_url.trim()) {
    let parsed;
    try { parsed = new URL(raw.replay_url.trim()); } catch { return null; }
    const host = /^replay([1-9]\d{0,3})\.valve\.net$/.exec(parsed.hostname);
    const path = /^\/570\/([1-9]\d{0,15})_([1-9]\d{0,15})\.dem\.bz2$/.exec(parsed.pathname);
    if (!host || !path || !["http:", "https:"].includes(parsed.protocol) ||
      parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash ||
      Number(path[1]) !== expectedMatchId ||
      cluster !== null && cluster !== Number(host[1]) ||
      salt !== null && salt !== Number(path[2])) return null;
    cluster = Number(host[1]);
    salt = positiveInteger(path[2]);
  }
  if (cluster === null || salt === null) return null;
  const filename = `${expectedMatchId}_${salt}.dem.bz2`;
  const address = `replay${cluster}.valve.net/570/${filename}`;
  return { filename, matchId: expectedMatchId, cluster, salt, urls: [`https://${address}`, `http://${address}`] };
}

export function replayProxySettings(env = process.env) {
  const address = env.LOCAL_REPLAY_PROXY_URL?.trim();
  const token = env.LOCAL_REPLAY_PROXY_TOKEN;
  if (!address && !token) return null;
  if (!address || !token || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error("Replay proxy requires a URL and a 64-character hex token");
  }
  let url;
  try { url = new URL(address); } catch { throw new Error("Replay proxy URL is invalid"); }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash ||
    url.username || url.password || url.port || isIP(url.hostname) ||
    url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Replay proxy must be a dedicated HTTPS origin");
  }
  return { url: url.origin, token };
}

export function retryDelaySeconds(attempts) {
  return Math.min(3_600, 60 * 2 ** Math.max(0, Math.min(6, attempts - 1)));
}

export async function incomingFile(directory, filename) {
  const path = join(directory, filename);
  const details = await lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!details) return null;
  if (!details.isFile() || details.size < 8 || details.size > MAX_REPLAY_BYTES) {
    throw new Error("Replay input is not a regular file within the size limit");
  }
  return path;
}

export async function cleanupStaleDownloads(directory, now = Date.now()) {
  let removed = 0;
  const owner = process.getuid?.();
  for (const filename of await readdir(directory)) {
    if (!/^\.replay-[0-9a-f-]{36}\.part$/.test(filename)) continue;
    const path = join(directory, filename);
    const details = await lstat(path).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (details?.isFile() && (owner === undefined || details.uid === owner) && now - details.mtimeMs > 3_600_000) {
      await rm(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}

// The only disk write here is a bounded, private temporary file. The importer
// checks compression, complete match identity and all ten players afterwards.
export async function downloadReplay(descriptor, directory, fetchImpl = fetch, proxy = null) {
  let forbidden = false;
  let lastError = "Replay download failed";
  let lastCode = "replay_download_failed";
  const sources = proxy ? [{
    url: `${proxy.url}/v1/replay/${descriptor.cluster}/${descriptor.matchId}/${descriptor.salt}`,
    name: "proxy",
  }] : descriptor.urls.map((url) => ({ url, name: "valve" }));
  for (const { url, name } of sources) {
    const temporary = join(directory, `.replay-${randomUUID()}.part`);
    let retained = false;
    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(name === "proxy" ? 300_000 : 120_000),
        headers: {
          "User-Agent": "Dota2Notes-ReplayWorker/1",
          ...(name === "proxy" ? { Authorization: `Bearer ${proxy.token}` } : {}),
        },
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 401) forbidden = true;
        lastError = `${name} replay returned HTTP ${response.status}`;
        lastCode = name === "proxy" && response.status === 401 ? "replay_proxy_auth_failed"
          : response.status === 403 ? "valve_access_blocked"
            : response.status === 404 ? "replay_not_ready"
              : name === "proxy" && (response.status >= 500 || response.status === 429) ? "replay_proxy_unavailable"
                : "replay_download_failed";
        await response.body?.cancel();
        continue;
      }
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REPLAY_BYTES)) {
        throw new Error("Replay download exceeds the size limit");
      }
      if (!response.body) throw new Error("Replay response has no body");
      let bytes = 0;
      await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _, done) {
        bytes += chunk.length;
        done(bytes > MAX_REPLAY_BYTES ? new Error("Replay download exceeds the size limit") : null, chunk);
      } }), createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      if (bytes < 8) throw new Error("Replay response is empty");
      const descriptorFile = await open(temporary, "r");
      const header = Buffer.alloc(7);
      try { await descriptorFile.read(header, 0, header.length, 0); }
      finally { await descriptorFile.close(); }
      if (header.toString("ascii", 0, 3) !== "BZh" &&
        !header.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])) &&
        header.toString("ascii") !== "PBDEMS2") {
        throw new Error("Valve response is not a replay file");
      }
      const existing = await incomingFile(directory, descriptor.filename);
      if (existing) return { path: existing, downloaded: false, source: "incoming" };
      // Keep downloads private and transient; only operator-provided filenames
      // can be picked up by another job after an interrupted process.
      retained = true;
      return { path: temporary, downloaded: true, source: name };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      lastCode = error?.code === "replay_proxy_auth_failed" ? error.code
        : name === "proxy" ? "replay_proxy_unavailable" : "replay_download_failed";
    } finally {
      if (!retained) await rm(temporary, { force: true });
    }
  }
  const error = new Error(lastError);
  error.code = forbidden && lastCode !== "replay_proxy_auth_failed" ? "valve_access_blocked" : lastCode;
  throw error;
}
