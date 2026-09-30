import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { Readable } from "node:stream";
import https from "node:https";
import { once } from "node:events";
import { downloadResilient, ReplayError, selectRoutes, transportConfig, requestRoute, responseError, strongEtag } from "../scripts/replay-parser/replay-transport.mjs";
import { retryDecision, processingPlan } from "../scripts/replay-parser/replay-job-policy.mjs";
import { ensureCapacity, verifyCheckpoint, inspectSpool } from "../scripts/replay-parser/replay-spool.mjs";
const directories = [], servers = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
const config = { origins: ["https://relay.test", "https://backup.test"], token: "a".repeat(64), addresses: [] };
const resolver = async () => ["1.1.1.1"];
const descriptor = { cluster: 189, matchId: 9013078038, salt: 724775528 };
const payload = Buffer.concat([Buffer.from("PBDEMS2"), Buffer.alloc(128, 42)]);
const response = (status, data = payload, headers = {}) => ({ status, headers: new Headers({ "content-length": String(data.length), etag: '"stable-file"', ...headers }), body: Readable.from([data]), close() { this.body.destroy(); } });
async function target() { const dir = await mkdtemp(join(tmpdir(), "replay-resilience-")); directories.push(dir); return join(dir, ".replay-01234567-89ab-cdef-0123-456789abcdef.part"); }
function recorder() {
  const events = [], checkpoints = [], progress = [];
  return { events, checkpoints, progress, hooks: { event: async (...a) => events.push(a), checkpoint: async c => checkpoints.push(c), progress: async p => progress.push(p) } };
}
describe("replay resilient transport", () => {
  it("switches to the other origin after a connection failure and verifies the entire payload", async () => {
    const path = await target(), seen = [], recording = recorder();
    const result = await downloadResilient(descriptor, path, {}, config, recording.hooks, { resolver, request: async (url, route, headers) => {
      seen.push(route.endpoint); expect(headers.Authorization).toBe(`Bearer ${config.token}`);
      if (route.endpoint === config.origins[0]) throw new ReplayError("replay_connect_timeout", "timeout", { circuit: true });
      return response(200);
    }});
    expect(seen).toEqual(config.origins); expect(await readFile(path)).toEqual(payload);
    expect(result.bytes).toBe(payload.length); expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(recording.checkpoints.at(-1).complete).toBe(true);
    expect(recording.progress.reduce((s,p) => s + p.delta, 0)).toBe(payload.length);
  });
  it("recovers from a 520 without misclassifying it as a missing replay", async () => {
    let calls = 0;
    const result = await downloadResilient(descriptor, await target(), {}, config, {}, { resolver,
      request: async () => ++calls === 1 ? response(520, Buffer.from("error"), { "x-replay-error-source": "valve" }) : response(200) });
    expect(calls).toBe(2); expect(result.bytes).toBe(payload.length);
  });
  it("resumes a partial file only with matching strong ETag and exact content range", async () => {
    const path = await target(); await writeFile(path, payload.subarray(0, 40));
    const result = await downloadResilient(descriptor, path, { etag: '"stable-file"', total: payload.length }, config, {}, { resolver, request: async (_url,_route,headers) => {
      expect(headers.Range).toBe("bytes=40-"); expect(headers["If-Range"]).toBe('"stable-file"');
      return response(206, payload.subarray(40), { "content-range": `bytes 40-${payload.length - 1}/${payload.length}` });
    }});
    expect(result.bytes).toBe(payload.length); expect(await readFile(path)).toEqual(payload);
  });
  it("restarts instead of appending if the origin ignores Range", async () => {
    const path = await target(); await writeFile(path, Buffer.alloc(40, 1));
    await downloadResilient(descriptor, path, { etag: '"stable-file"', total: payload.length }, config, {}, { resolver, request: async () => response(200) });
    expect(await readFile(path)).toEqual(payload);
  });
  it("rejects a changed range validator then restarts from byte zero", async () => {
    const path = await target(); await writeFile(path, payload.subarray(0,40)); let calls = 0;
    await downloadResilient(descriptor, path, { etag: '"stable-file"', total: payload.length }, config, {}, { resolver, request: async (_u,_r,h) => {
      if (++calls === 1) return response(206,payload.subarray(40),{etag:'"different"',"content-range":`bytes 40-${payload.length-1}/${payload.length}`});
      expect(h.Range).toBeUndefined(); return response(200);
    }});
    expect(await readFile(path)).toEqual(payload);
  });
  it("keeps a resumable partial checkpoint after an interrupted body", async () => {
    const path = await target(), recording = recorder();
    await expect(downloadResilient(descriptor, path, {}, config, recording.hooks, { resolver, maxAttempts: 1, request: async () => ({
      ...response(200), body: Readable.from((async function* () { yield payload.subarray(0,40); await new Promise(resolve => setTimeout(resolve,10)); throw new Error("socket reset"); })()),
    })})).rejects.toMatchObject({ code: "replay_body_interrupted" });
    expect((await readFile(path)).length).toBe(40);
    expect(recording.checkpoints[0]).toMatchObject({ etag: '"stable-file"', total: payload.length, complete:false });
  });
  it("never treats HTML as a replay, even with HTTP 200", async () => {
    const path = await target();
    await expect(downloadResilient(descriptor,path,{},config,{}, {resolver,maxAttempts:1,request:async()=>response(200,Buffer.from("<html>not a replay</html>"))})).rejects.toMatchObject({code:"replay_payload_invalid"});
    expect((await readFile(path)).length).toBe(0);
  });
  it("does not repeatedly retry a wrong token or a redirect", async () => {
    for (const status of [401,302]) {
      let calls=0;
      await expect(downloadResilient(descriptor,await target(),{},config,{}, {resolver,request:async()=>{ calls++; return response(status); }})).rejects.toMatchObject({retryable:false});
      expect(calls).toBe(1);
    }
  });
  it("respects rate limits and does not retry the same limited origin in the same round", async () => {
    let calls=0;
    await expect(downloadResilient(descriptor,await target(),{}, {...config,origins:[config.origins[0]]},{}, {resolver,request:async()=>{
      calls++; return response(429,Buffer.from("limit"),{"retry-after":"600"});
    }})).rejects.toMatchObject({retryAfter:600}); expect(calls).toBe(1);
  });
  it("does not disable TLS verification while using a chosen address", async () => {
    const key=await readFile(new URL("./fixtures/replay-tls/key.pem",import.meta.url));
    const cert=await readFile(new URL("./fixtures/replay-tls/cert.pem",import.meta.url));
    const server=https.createServer({key,cert},(_req,res)=>{res.writeHead(200,{"content-length":payload.length});res.end(payload);});
    servers.push(server); server.listen(0,"127.0.0.1"); await once(server,"listening");
    const route={endpoint:"https://relay.test",address:"1.1.1.1"};
    const requestImpl=(url,options)=>{
      expect(options.rejectUnauthorized).toBe(true);expect(options.servername).toBe("relay.test");
      return https.request(url,{...options,port:server.address().port,ca:cert,lookup:(_h,o,cb)=>o.all?cb(null,[{address:"127.0.0.1",family:4}]):cb(null,"127.0.0.1",4)});
    };
    const result=await requestRoute("https://relay.test/replay",route,{}, {requestImpl});
    const chunks=[];for await(const chunk of result.body)chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(payload);
  });
  it("checks response-stage timeouts with a real stalled HTTPS server", async () => {
    const key=await readFile(new URL("./fixtures/replay-tls/key.pem",import.meta.url));
    const cert=await readFile(new URL("./fixtures/replay-tls/cert.pem",import.meta.url));
    const server=https.createServer({key,cert},()=>{}); servers.push(server); server.listen(0,"127.0.0.1");await once(server,"listening");
    const requestImpl=(url,options)=>https.request(url,{...options,port:server.address().port,ca:cert,lookup:(_h,o,cb)=>o.all?cb(null,[{address:"127.0.0.1",family:4}]):cb(null,"127.0.0.1",4)});
    await expect(requestRoute("https://relay.test/replay",{address:"1.1.1.1"},{},{requestImpl,headersMs:60,connectMs:1000,totalMs:1000})).rejects.toMatchObject({code:"replay_headers_timeout"});
  });
});
describe("route and checkpoint policy",()=>{
  it("skips a cooling route and remembers a recent successful address through DNS failure",async()=>{
    const now=Date.now();const routes=await selectRoutes(config,{routes:async()=>[
      {endpoint:config.origins[0],address:"1.1.1.1",open_until:new Date(now+10000),last_success_at:new Date(now-10000)},
      {endpoint:config.origins[1],address:"8.8.8.8",last_success_at:new Date(now-1000)},
    ]},async()=>[],now);
    expect(routes.map(r=>r.address)).toEqual(["8.8.8.8"]);
  });
  it("rejects unsafe relay configuration and weak validators",()=>{
    for(const url of ["http://relay.test","https://127.0.0.1","https://relay.test/?secret=bad"])expect(()=>transportConfig({LOCAL_REPLAY_PROXY_URL:url,LOCAL_REPLAY_PROXY_TOKEN:config.token})).toThrow();
    expect(()=>transportConfig({LOCAL_REPLAY_PROXY_URL:config.origins[0],LOCAL_REPLAY_PROXY_TOKEN:config.token,LOCAL_REPLAY_PROXY_FALLBACK_IPS:"127.0.0.1"})).toThrow();
    expect(strongEtag('W/"weak"')).toBeNull();
    expect(responseError(response(520,payload,{"x-replay-error-source":"valve"})).circuit).toBe(false);
  });
  it("caps retry by request lifetime and honors Retry-After",()=>{
    const now=Date.now(),job={attempts:2,retry_deadline_at:new Date(now+86400000)};
    expect(retryDecision(new ReplayError("network","network",{retryAfter:600}),job,now,()=>0)).toMatchObject({status:"pending",delay:600});
    expect(retryDecision(new ReplayError("network","network"),{...job,retry_deadline_at:new Date(now)},now)).toMatchObject({status:"failed",code:"replay_retry_exhausted"});
    expect(retryDecision(new ReplayError("auth","auth",{retryable:false}),job,now)).toMatchObject({status:"failed",code:"auth"});
  });
  it("retries one initial connection failure sooner while keeping later and rate-limited backoff",()=>{
    const now=Date.now(),job={attempts:1,retry_deadline_at:new Date(now+86400000)};
    expect(retryDecision(new ReplayError("replay_connect_failed","network"),job,now,()=>0)).toMatchObject({status:"pending",delay:20});
    expect(retryDecision(new ReplayError("replay_connect_timeout","network"),job,now,()=>1)).toMatchObject({status:"pending",delay:25});
    expect(retryDecision(new ReplayError("replay_connect_failed","network"),{...job,attempts:2},now,()=>0)).toMatchObject({status:"pending",delay:120});
    expect(retryDecision(new ReplayError("replay_metadata_rate_limited","limited",{retryAfter:300}),job,now,()=>0)).toMatchObject({status:"pending",delay:300});
  });
  it("reuses the checkpoint after upload failure, and prefers an existing archive",()=>{
    expect(processingPlan({archived:false,parsed:true,intent:"analysis",checkpoint:true})).toBe("use-checkpoint");
    expect(processingPlan({archived:true,parsed:false,intent:"download",checkpoint:false})).toBe("complete");
    expect(processingPlan({archived:true,parsed:false,intent:"analysis",checkpoint:false})).toBe("restore-archive");
  });
  it("validates a saved checksum before reuse and pauses when disk reserve is exhausted",async()=>{
    const path=await target();const result=await downloadResilient(descriptor,path,{},config,{}, {resolver,request:async()=>response(200)});
    await chmod(path,0o600);const dir=dirname(path);const file=await inspectSpool(dir,basename(path));
    expect(await verifyCheckpoint(file,result.sha256,payload.length)).toBe(true);
    await writeFile(path,Buffer.alloc(payload.length));expect(await verifyCheckpoint(file,result.sha256,payload.length)).toBe(false);
    await expect(ensureCapacity(dir,0,async()=>({bavail:100,bsize:4096}))).rejects.toMatchObject({code:"replay_disk_capacity"});
  });
});
