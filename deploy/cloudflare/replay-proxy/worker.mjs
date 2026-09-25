// A private, streaming Valve replay relay. Deploy as an independently owned
// Cloudflare Worker; do not route arbitrary URLs or buffer replay bodies.
const MAX_REPLAY_BYTES = 200 * 1024 * 1024;
const REPLAY_PATH = /^\/v1\/replay\/([1-9]\d{0,3})\/([1-9]\d{0,15})\/([1-9]\d{0,15})$/;

function authenticated(request, secret) {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret)) return false;
  const candidate = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function reply(message, status) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
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
    const match = REPLAY_PATH.exec(url.pathname);
    if (!match || !Number.isSafeInteger(Number(match[2])) || !Number.isSafeInteger(Number(match[3]))) {
      return reply("Invalid replay path", 400);
    }
    const range = request.headers.get("range");
    if (range && range !== "bytes=0-31") return reply("Unsupported range", 400);
    const [cluster, matchId, salt] = match.slice(1);
    const valveUrl = `http://replay${cluster}.valve.net/570/${matchId}_${salt}.dem.bz2`;
    const headers = range ? { Range: range } : {};
    let upstream;
    try { upstream = await fetchUpstream(valveUrl, { redirect: "manual", headers }); }
    catch { return reply("Valve origin unavailable", 502); }
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return reply("Valve redirect rejected", 502);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return reply(`Valve returned ${upstream.status}`, upstream.status);
    }
    if (!range && upstream.status !== 200) {
      await upstream.body?.cancel();
      return reply("Valve returned a partial replay", 502);
    }
    if (range && (upstream.status !== 206 || upstream.headers.get("content-range")?.split("/")[0] !== "bytes 0-31")) {
      await upstream.body?.cancel();
      return reply("Valve did not honor replay range", 502);
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
    });
    if (length !== null) responseHeaders.set("Content-Length", length);
    if (range) responseHeaders.set("Content-Range", upstream.headers.get("content-range"));
    // Passing the upstream ReadableStream directly preserves backpressure and
    // avoids keeping a ~100 MB replay in the Worker's 128 MB memory budget.
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

export default { fetch: createReplayProxy() };
