import { describe, expect, it } from "vitest";
import { createReplayProxy } from "../../../deploy/cloudflare/replay-proxy/worker.mjs";

const env = { REPLAY_PROXY_TOKEN: "a".repeat(64) };
const path = "https://replay.example.org/v1/replay/189/9013078038/724775528";
const request = (url, headers = {}, method = "GET") => new Request(url, {
  method, headers: { authorization: `Bearer ${env.REPLAY_PROXY_TOKEN}`, ...headers },
});

describe("private Valve replay relay", () => {
  it("rejects unauthenticated, arbitrary, and redirected requests without fetching", async () => {
    let called = 0;
    const handler = createReplayProxy(async () => { called += 1; return new Response(null, { status: 302 }); });
    expect((await handler(new Request(path), env)).status).toBe(401);
    expect((await handler(request(`${path}?url=http://127.0.0.1`), env)).status).toBe(400);
    expect((await handler(request("https://replay.example.org/v1/replay/0/9013078038/724775528"), env)).status).toBe(400);
    expect((await handler(request(path, { range: "bytes=0-999999" }), env)).status).toBe(400);
    expect((await handler(request(path, {}, "POST"), env)).status).toBe(405);
    expect((await handler(request("https://replay.example.org/healthz"), env)).status).toBe(200);
    expect(called).toBe(0);
    expect((await handler(request(path), env)).status).toBe(502);
    expect(called).toBe(1);
  });

  it("forwards a bounded probe to the exact Valve host and relays its bytes", async () => {
    const calls = [];
    const header = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, ...Array(28).fill(0)]);
    const handler = createReplayProxy(async (url, options) => {
      calls.push({ url, options });
      return new Response(header, {
        status: 206,
        headers: { "Content-Range": "bytes 0-31/108902277", "Content-Length": "32" },
      });
    });
    const result = await handler(request(path, { range: "bytes=0-31" }), env);
    expect(calls).toEqual([{
      url: "http://replay189.valve.net/570/9013078038_724775528.dem.bz2",
      options: expect.objectContaining({ redirect: "manual", headers: { Range: "bytes=0-31" }, signal: expect.any(AbortSignal) }),
    }]);
    expect(result.status).toBe(206);
    expect(result.headers.get("content-range")).toBe("bytes 0-31/108902277");
    expect(Buffer.from(await result.arrayBuffer())).toEqual(header);
  });

  it("passes through a full stream without buffering and rejects oversized origin replies", async () => {
    let readCount = 0;
    const payload = new ReadableStream({ pull(controller) {
      readCount += 1;
      controller.enqueue(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]));
      if (readCount === 3) controller.close();
    } });
    const handler = createReplayProxy(async () => new Response(payload, { headers: { "Content-Length": "12" } }));
    const result = await handler(request(path), env);
    expect(result.status).toBe(200);
    expect(result.body).toBe(payload);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await result.arrayBuffer())).toHaveLength(12);
    const large = createReplayProxy(async () => new Response("oversized", {
      headers: { "content-length": "209715201" },
    }));
    expect((await large(request(path), env)).status).toBe(413);
  });
});

it("relays safe resume ranges and their strong validator without buffering", async () => {
  let forwarded;
  const handler = createReplayProxy(async (_url, options) => {
    forwarded = options.headers;
    return new Response(new Uint8Array(60), { status:206, headers:{"content-range":"bytes 40-99/100","content-length":"60",etag:'"same-file"'} });
  });
  const result = await handler(request(path, { range:"bytes=40-", "if-range":'"same-file"' }), env);
  expect(forwarded).toEqual({Range:"bytes=40-","If-Range":'"same-file"'});
  expect(result.status).toBe(206);expect(result.headers.get("etag")).toBe('"same-file"');
  expect(result.headers.get("x-replay-relay")).toBe("2");
});
it("rejects arbitrary, multi and oversized ranges, and identifies Valve errors", async () => {
  let calls=0;
  const handler=createReplayProxy(async()=>{calls++;return new Response("bad gateway",{status:520});});
  for(const range of ["bytes=0-10,20-30","bytes=209715200-","bytes=-30","bytes=abc-"]){
    expect((await handler(request(path,{range,"if-range":'"file"'}),env)).status).toBe(400);
  }
  expect(calls).toBe(0);
  const result=await handler(request(path),env);
  expect(result.status).toBe(520);expect(result.headers.get("x-replay-error-source")).toBe("valve");
});

it("returns only verified replay metadata for the requested match", async () => {
  const calls = [];
  const handler = createReplayProxy(async (url, options) => {
    calls.push(url);
    expect(options.redirect).toBe("manual");
    return Response.json([
      { match_id: 4, cluster: 42, replay_salt: 999 },
      { match_id: 9020830802, cluster: 436, replay_salt: 123456789, secret: "discard" },
    ]);
  });
  const url = "https://replay.example.org/v1/metadata/9020830802";
  expect((await handler(new Request(url), env)).status).toBe(401);
  expect((await handler(request(`${url}?url=http://localhost`), env)).status).toBe(400);
  expect((await handler(request(url, { range: "bytes=0-31" }), env)).status).toBe(400);
  const result = await handler(request(url), env);
  expect(await result.json()).toEqual({ match_id: 9020830802, cluster: 436, replay_salt: 123456789 });
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(calls).toEqual(["https://api.opendota.com/api/matches/9020830802"]);
});

it("checks the OpenDota match when replays are missing and never invents a salt", async () => {
  const url = "https://replay.example.org/v1/metadata/9020830802";
  const calls = [];
  const handler = createReplayProxy(async path => {
    calls.push(path);
    return path.includes("/matches/") ? Response.json({ match_id: 9020830802 }) : Response.json([{
      match_id: 9020830802, cluster: 436, replay_salt: 111,
    }]);
  });
  expect(await (await handler(request(url), env)).json()).toEqual({ match_id: 9020830802, cluster: 436, replay_salt: 111 });
  expect(calls).toHaveLength(2);
  const notFoundThenMatch = createReplayProxy(async path => path.includes("/matches/")
    ? new Response(null, { status: 404 })
    : Response.json([{ match_id: 9020830802, cluster: 436, replay_salt: 222 }]));
  expect(await (await notFoundThenMatch(request(url), env)).json()).toEqual({ match_id: 9020830802, cluster: 436, replay_salt: 222 });
  const missing = createReplayProxy(async () => Response.json({ match_id: 42, cluster: 436, replay_salt: 111 }));
  expect((await missing(request(url), env)).status).toBe(404);
  const oversized = createReplayProxy(async () => new Response("x", { headers: { "content-length": "9999999" } }));
  expect((await oversized(request(url), env)).status).toBe(502);
});

it("uses the exact replay URL from the match when the replays API is rate limited", async () => {
  const url = "https://replay.example.org/v1/metadata/9023606320";
  const calls = [];
  const handler = createReplayProxy(async path => {
    calls.push(path);
    return path.includes("/matches/") ? Response.json({
      match_id: 9023606320, cluster: 271,
      replay_url: "http://replay271.valve.net/570/9023606320_349414436.dem.bz2",
    }) : new Response("limit", { status: 429 });
  });
  expect(await (await handler(request(url), env)).json()).toEqual({
    match_id: 9023606320, cluster: 271, replay_salt: 349414436,
  });
  expect(calls).toEqual(["https://api.opendota.com/api/matches/9023606320"]);
});

it("tries the other metadata endpoint once after a 429 and preserves rate limiting if both fail", async () => {
  const url = "https://replay.example.org/v1/metadata/9023606320";
  const calls = [];
  const fallback = createReplayProxy(async path => {
    calls.push(path);
    return path.includes("/matches/") ? new Response("limit", { status: 429, headers: { "retry-after": "600" } })
      : Response.json([{ match_id: 9023606320, cluster: 271, replay_salt: 349414436 }]);
  });
  expect((await fallback(request(url), env)).status).toBe(200);
  expect(calls).toHaveLength(2);
  const limited = createReplayProxy(async () => new Response("limit", { status: 429, headers: { "retry-after": "600" } }));
  const result = await limited(request(url), env);
  expect(result.status).toBe(429);
  expect(result.headers.get("retry-after")).toBe("600");
  expect(result.headers.get("x-replay-error-source")).toBe("opendota");
});

it("uses the private OpenDota key only after public metadata is rate limited", async () => {
  const url = "https://replay.example.org/v1/metadata/9023606320";
  const keyedEnv = { ...env, OPENDOTA_API_KEY: "private-key" };
  const calls = [];
  const handler = createReplayProxy(async path => {
    calls.push(path);
    if (path.includes("api_key=")) return Response.json({
      match_id: 9023606320, cluster: 271, replay_salt: 349414436,
    });
    return new Response("rate limited", { status: 429 });
  });
  expect(await (await handler(request(url), keyedEnv)).json()).toEqual({
    match_id: 9023606320, cluster: 271, replay_salt: 349414436,
  });
  expect(calls).toEqual([
    "https://api.opendota.com/api/matches/9023606320",
    "https://api.opendota.com/api/replays?match_id=9023606320",
    "https://api.opendota.com/api/matches/9023606320?api_key=private-key",
  ]);
  calls.length = 0;
  const publicHandler = createReplayProxy(async path => {
    calls.push(path);
    return Response.json({ match_id: 9023606320, cluster: 271, replay_salt: 349414436 });
  });
  expect((await publicHandler(request(url), keyedEnv)).status).toBe(200);
  expect(calls).toEqual(["https://api.opendota.com/api/matches/9023606320"]);
});

it("does not trust a replay URL with a different ID, cluster, origin or query", async () => {
  const url = "https://replay.example.org/v1/metadata/9023606320";
  for (const replayUrl of [
    "http://replay271.valve.net/570/9023606321_349414436.dem.bz2",
    "http://replay272.valve.net/570/9023606320_349414436.dem.bz2",
    "http://replay271.valve.net.evil.test/570/9023606320_349414436.dem.bz2",
    "http://replay271.valve.net/570/9023606320_349414436.dem.bz2?extra=1",
  ]) {
    const handler = createReplayProxy(async () => Response.json({ match_id: 9023606320, cluster: 271, replay_url: replayUrl }));
    expect((await handler(request(url), env)).status).toBe(404);
  }
});
