import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:https";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fetchWithCurlDirectIp, parseCurlResponse, checkStratzCurlAvailable } from "../src/lib/stratz/curl-transport";
import { TEST_KEY, TEST_CERT } from "./fixtures/stratz-local-tls";

vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn((command: string, args: string[], options: import("node:child_process").SpawnOptions) => {
    // Trust only the public fixture CA for this test server. An explicit flag
    // also works with Windows Schannel builds that ignore CURL_CA_BUNDLE.
    const ca = process.env.CURL_CA_BUNDLE;
    return actual.spawn(command, ca ? [...args, "--cacert", ca] : args, options);
  }) };
});

let folder: string, server: Server, origin: string;
let observed: { url?: string; authorization?: string; body?: string } = {};
beforeAll(async () => {
  folder=await mkdtemp(fileURLToPath(new URL("../.stratz-tls-",import.meta.url)));
  await writeFile(join(folder,"cert.pem"),TEST_CERT);
  server=createServer({key:TEST_KEY,cert:TEST_CERT},(req,res)=>{
    let body="";
    req.on("data",chunk=>body+=chunk);
    req.on("end",()=>{
      observed={url:req.url,authorization:req.headers.authorization,body};
      if(req.url==="/rate") { res.writeHead(429,{"Retry-After":"60","Content-Type":"application/json"});res.end('{"message":"rate limit"}');return; }
      if(req.url==="/redirect") { res.writeHead(302,{Location:origin+"/ok"});res.end();return; }
      const gz=gzipSync(req.url==="/large" ? 'x'.repeat(200000) : JSON.stringify({message:"متن فارسی",ok:true}));
      res.writeHead(200,{"Content-Encoding":"gzip","Content-Type":"application/json","CF-Ray":"test-FRA"});
      if(req.url==="/partial") {res.write(gz.subarray(0,10));return;}
      res.end(gz);
    });
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();
  if(!address || typeof address==="string")throw new Error("Test listener unavailable");
  origin=`https://localhost:${address.port}`;
});
afterEach(()=>vi.unstubAllEnvs());
afterAll(async()=>{
  server?.closeAllConnections();
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(folder)await rm(folder,{recursive:true,force:true});
});
function request(path:string,max=4096,signal=AbortSignal.timeout(3000)) {
  vi.stubEnv("CURL_CA_BUNDLE",join(folder,"cert.pem"));
  return fetchWithCurlDirectIp(origin+path,{method:"POST",headers:{Authorization:'Bearer private-token',"Content-Type":"application/json","User-Agent":"STRATZ_API"},body:JSON.stringify({query:'query { value(text: "a\\b") }'}),signal},"127.0.0.1",max);
}
describe("curl pinned HTTPS STRATZ transport",()=>{
  it("verifies TLS, sends exact JSON and decodes gzip including non-ASCII content",async()=>{
    await checkStratzCurlAvailable();
    const response=await request("/ok");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({message:"متن فارسی",ok:true});
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("cf-ray")).toBe("test-FRA");
    expect(observed.authorization).toBe("Bearer private-token");
    expect(JSON.parse(observed.body!)).toEqual({query:'query { value(text: "a\\b") }'});
    const call=vi.mocked(spawn).mock.calls.at(-1)!;
    expect(JSON.stringify(call.slice(0,2))).not.toContain("private-token");
    expect(JSON.stringify(call.slice(0,2))).not.toContain("value(text");
    expect(call[1]).toEqual(expect.arrayContaining(["--config","-","--proto","=https"]));
  });
  it("preserves provider status and Retry-After and never follows redirects",async()=>{
    const rate=await request("/rate");
    expect(rate.status).toBe(429);expect(rate.headers.get("retry-after")).toBe("60");
    const redirect=await request("/redirect");
    expect(redirect.status).toBe(302);expect(observed.url).toBe("/redirect");
  });
  it("rejects a partial HTTP200 instead of returning incomplete JSON",async()=>{
    await expect(request("/partial",4096,AbortSignal.timeout(600))).rejects.toMatchObject({name:"AbortError"});
  });
  it("limits decompressed bodies, including small compressed large-output responses",async()=>{
    await expect(request("/large",1024)).rejects.toMatchObject({code:"stratz_response_too_large"});
  });
  it("rejects pre-aborted requests and strips wire headers after decoding",async()=>{
    await expect(request("/ok",4096,AbortSignal.abort())).rejects.toMatchObject({name:"AbortError"});
    const response=parseCurlResponse(Buffer.from('HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 5\r\nContent-Encoding: gzip\r\n\r\n{"ok":true}'),4096);
    expect(await response.json()).toEqual({ok:true});
    expect(response.headers.get("content-length")).toBeNull();
    expect(()=>parseCurlResponse(Buffer.from("not HTTP"),4096)).toThrow();
  });
  it("reports a missing curl executable without logging or hanging",async()=>{
    vi.stubEnv("PATH",folder);
    await expect(request("/ok")).rejects.toMatchObject({code:"stratz_transport_unavailable"});
    await expect(checkStratzCurlAvailable()).rejects.toThrow();
  });
});
