import { describe, expect, it } from "vitest";
import { createReplayProxy } from "../deploy/cloudflare/replay-proxy/worker.mjs";

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
      options: { redirect: "manual", headers: { Range: "bytes=0-31" } },
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
