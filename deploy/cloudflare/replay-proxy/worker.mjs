// A private, streaming Valve replay relay. Deploy as an independently owned
// Cloudflare Worker; do not route arbitrary URLs or buffer replay bodies.
const MAX_REPLAY_BYTES = 200 * 1024 * 1024;
const REPLAY_PATH = /^\/v1\/replay\/([1-9]\d{0,3})\/([1-9]\d{0,15})\/([1-9]\d{0,15})$/;
const METADATA_PATH = /^\/v1\/metadata\/([1-9]\d{0,15})$/;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

function positiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value)) &&
    Number.isSafeInteger(number) && number > 0 && number <= max ? number : null;
}

async function metadataFromOpenDota(matchId, fetchUpstream) {
  let unavailable = false;
  for (const path of [`replays?match_id=${matchId}`, `matches/${matchId}`]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    let response;
    try {
      response = await fetchUpstream(`https://api.opendota.com/api/${path}`, {
        redirect: "manual", headers: { Accept: "application/json" }, signal: controller.signal,
      });
      if (response.status === 429) return reply("OpenDota rate limited", 429, "opendota", {
        ...(response.headers.has("retry-after") ? { "Retry-After": response.headers.get("retry-after") } : {}),
      });
      if (response.status === 404) continue;
      if (!response.ok || response.status !== 200) { unavailable = true; continue; }
      if (Number(response.headers.get("content-length") || 0) > MAX_METADATA_BYTES) { unavailable = true; continue; }
      let size = 0;
      const decoder = new TextDecoder();
      let text = "";
      for await (const chunk of response.body || []) {
        size += chunk.byteLength;
        if (size > MAX_METADATA_BYTES) { unavailable = true; break; }
        text += decoder.decode(chunk, { stream: true });
      }
      if (size > MAX_METADATA_BYTES) continue;
      let data;
      try { data = JSON.parse(text + decoder.decode()); }
      catch { unavailable = true; continue; }
      const candidates = Array.isArray(data) ? data : [data];
      const found = candidates.find(item => item && positiveInteger(item.match_id) === matchId &&
        positiveInteger(item.replay_salt) !== null);
      if (found) {
        const cluster = positiveInteger(found.cluster, 9_999);
        const salt = positiveInteger(found.replay_salt);
        return Response.json({ match_id: matchId, cluster, replay_salt: salt }, {
          headers: { "Cache-Control": "private, no-store", "X-Replay-Relay": "2" },
        });
      }
    } catch { unavailable = true; }
    finally { clearTimeout(timer); await response?.body?.cancel().catch(() => {}); }
  }
  return reply(unavailable ? "OpenDota unavailable" : "Replay metadata not ready", unavailable ? 502 : 404, "opendota");
}

function authenticated(request, secret) {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret)) return false;
  const candidate = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function reply(message, status, source = "worker", extra = {}) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain",
    "X-Replay-Relay": "2", "X-Replay-Error-Source": source, ...extra } });
}

export function createReplayProxy(fetchUpstream = fetch) {
  return async (request, env) => {
    if (typeof env?.REPLAY_PROXY_TOKEN !== "string" || !/^[a-f0-9]{64}$/i.test(env.REPLAY_PROXY_TOKEN)) {
      return reply("Proxy is not configured", 503);
    }
    if (!authenticated(request, env.REPLAY_PROXY_TOKEN)) return reply("Unauthorized", 401);
    if (request.method !== "GET") return reply("Method not allowed", 405);
    const url = new URL(request.url);
    if (url.search || url.hash) return reply("Unexpected query", 400);
    if (url.pathname === "/healthz") return reply("ok", 200);
    const metadata = METADATA_PATH.exec(url.pathname);
    if (metadata) {
      const matchId = positiveInteger(metadata[1]);
      if (!matchId || request.headers.has("range")) return reply("Invalid metadata request", 400);
      return metadataFromOpenDota(matchId, fetchUpstream);
    }
    const match = REPLAY_PATH.exec(url.pathname);
    if (!match || !Number.isSafeInteger(Number(match[2])) || !Number.isSafeInteger(Number(match[3]))) {
      return reply("Invalid replay path", 400);
    }
    const range = request.headers.get("range");
    const resume = range && /^bytes=([1-9]\d*)-$/.exec(range);
    const ifRange = request.headers.get("if-range");
    if (range && range !== "bytes=0-31" && (!resume || Number(resume[1]) >= MAX_REPLAY_BYTES ||
      !/^"[^"\x00-\x20\x7f]{1,250}"$/.test(ifRange || ""))) return reply("Unsupported range", 400);
    const [cluster, matchId, salt] = match.slice(1);
    const valveUrl = `http://replay${cluster}.valve.net/570/${matchId}_${salt}.dem.bz2`;
    const headers = range ? { Range: range, ...(resume ? { "If-Range": ifRange } : {}) } : {};
    let upstream;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try { upstream = await fetchUpstream(valveUrl, { redirect: "manual", headers, signal: controller.signal }); }
    catch { return reply("Valve origin unavailable", 502, "valve"); }
    finally { clearTimeout(timer); }
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return reply("Valve redirect rejected", 502);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return reply(`Valve returned ${upstream.status}`, upstream.status, "valve", upstream.headers.has("retry-after") ? { "Retry-After": upstream.headers.get("retry-after") } : {});
    }
    if (!range && upstream.status !== 200) {
      await upstream.body?.cancel();
      return reply("Valve returned a partial replay", 502);
    }
    if (range === "bytes=0-31" && (upstream.status !== 206 || upstream.headers.get("content-range")?.split("/")[0] !== "bytes 0-31")) {
      await upstream.body?.cancel();
      return reply("Valve did not honor replay range", 502);
    }
    const contentRange = upstream.headers.get("content-range");
    if (resume && upstream.status === 206) {
      const parsed = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange || "");
      if (!parsed || Number(parsed[1]) !== Number(resume[1]) || Number(parsed[2]) !== Number(parsed[3]) - 1 || Number(parsed[3]) > MAX_REPLAY_BYTES) {
        await upstream.body?.cancel(); return reply("Invalid Valve range", 502, "valve");
      }
    }
    const length = upstream.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REPLAY_BYTES)) {
      await upstream.body?.cancel();
      return reply("Replay exceeds size limit", 413);
    }
    if (!upstream.body) return reply("Valve returned an empty body", 502);
    const responseHeaders = new Headers({
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Replay-Relay": "2",
    });
    if (length !== null) responseHeaders.set("Content-Length", length);
    if (upstream.status === 206 && contentRange) responseHeaders.set("Content-Range", contentRange);
    for (const key of ["etag", "accept-ranges", "last-modified"]) if (upstream.headers.has(key)) responseHeaders.set(key, upstream.headers.get(key));
    // Passing the upstream ReadableStream directly preserves backpressure and
    // avoids keeping a ~100 MB replay in the Worker's 128 MB memory budget.
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

export default { fetch: createReplayProxy() };
