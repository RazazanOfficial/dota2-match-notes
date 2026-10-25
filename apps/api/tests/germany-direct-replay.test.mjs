import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createServer } from "node:http";
import { downloadResilient, transportConfig, requestRoute } from "../scripts/replay-parser/replay-transport.mjs";
import { pipelineLanes } from "../scripts/replay-parser/run-pipeline.mjs";
const folders=[];
afterEach(async()=>{for(const dir of folders.splice(0))await rm(dir,{recursive:true,force:true});});
const descriptor={matchId:9059929932,cluster:189,salt:12345};
const payload=Buffer.concat([Buffer.from("PBDEMS2"),Buffer.alloc(128)]);
const config=()=>transportConfig({LOCAL_REPLAY_DOWNLOAD_MODE:"direct",LOCAL_REPLAY_PROXY_TOKEN:"invalid-unused"});
const response=(status=200,headers={})=>({status,headers:new Headers({"content-length":String(payload.length),etag:'"same"',...headers}),body:Readable.from([payload]),close(){this.body.destroy();}});
async function target(){const dir=await mkdtemp(join(tmpdir(),"germany-replay-"));folders.push(dir);return join(dir,"download.part");}
describe("direct Valve worker transfer",()=>{
 it("downloads the canonical Valve path without exposing the relay token or trusting URLs",async()=>{
  const path=await target();
  const result=await downloadResilient({...descriptor,urls:["http://127.0.0.1/private"]},path,{},config(),{},{resolver:async host=>{expect(host).toBe("replay189.valve.net");return ["1.1.1.1"];},request:async(url,route,headers)=>{
   expect(url).toBe("http://replay189.valve.net/570/9059929932_12345.dem.bz2");expect(headers.Authorization).toBeUndefined();expect(route.address).toBe("1.1.1.1");return response();
  }});
  expect(result.source).toBe("valve");expect(await readFile(path)).toEqual(payload);expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
 });
 it("refuses invalid identifiers before resolving any network destination",async()=>{
  await expect(downloadResilient({...descriptor,cluster:"189.evil.test"},await target(),{},config(),{},{resolver:()=>{throw new Error("must not resolve");}})).rejects.toMatchObject({code:"replay_metadata_invalid",retryable:false});
 });
 it("refuses a private DNS result",async()=>{
  await expect(downloadResilient(descriptor,await target(),{},config(),{},{resolver:async()=>["127.0.0.1"]})).rejects.toMatchObject({code:"replay_dns_failed"});
 });
 it("does not follow redirects and identifies a Valve failure correctly",async()=>{
  await expect(downloadResilient(descriptor,await target(),{},config(),{},{resolver:async()=>["1.1.1.1"],request:async()=>response(302)})).rejects.toMatchObject({code:"replay_redirect_rejected",retryable:false,errorSource:"valve"});
 });
 it("retains strong-ETag range validation in direct mode",async()=>{
  const path=await target();await writeFile(path,payload.subarray(0,40));
  await downloadResilient(descriptor,path,{etag:'"same"',total:payload.length},config(),{},{resolver:async()=>["1.1.1.1"],request:async(_u,_r,headers)=>{
   expect(headers.Range).toBe("bytes=40-");return {status:206,headers:new Headers({etag:'"same"',"content-length":String(payload.length-40),"content-range":`bytes 40-${payload.length-1}/${payload.length}`}),body:Readable.from([payload.subarray(40)]),close(){this.body.destroy();}};
  }});expect(await readFile(path)).toEqual(payload);
 });
 it("rejects an HTML response even with HTTP200",async()=>{
  await expect(downloadResilient(descriptor,await target(),{},config(),{},{maxAttempts:1,resolver:async()=>["1.1.1.1"],request:async()=>({...response(),body:Readable.from([Buffer.alloc(payload.length,60)])})})).rejects.toMatchObject({code:"replay_payload_invalid"});
 });
 it("keeps proxy mandatory by default and rejects unknown modes",()=>{
  expect(()=>transportConfig({})).toThrow();expect(()=>transportConfig({LOCAL_REPLAY_DOWNLOAD_MODE:"driect"})).toThrow();
 });
});
describe("bounded pipeline lanes",()=>{
 it("preserves the Iran default and enables two parsers explicitly",()=>{
  expect(pipelineLanes({})).toEqual(["prepare","prepare","parse","archive"]);
  expect(pipelineLanes({LOCAL_REPLAY_PARSE_CONCURRENCY:"2"}).filter(x=>x==="parse")).toHaveLength(2);
 });
 it("rejects unbounded, zero and fractional concurrency",()=>{
  for(const value of ["0","3","1.5","NaN"])expect(()=>pipelineLanes({LOCAL_REPLAY_PARSE_CONCURRENCY:value})).toThrow();
 });
});
it("uses the HTTP socket connect event while waiting for delayed Valve headers",async()=>{
 const server=createServer((_req,res)=>setTimeout(()=>res.end(payload),250));
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try {
  const response=await requestRoute(`http://replay189.valve.net:${server.address().port}/570/test`,{address:"127.0.0.1"},{},{connectMs:100,headersMs:2000,totalMs:3000});
  const chunks=[];for await(const chunk of response.body)chunks.push(chunk);
  expect(response.status).toBe(200);expect(Buffer.concat(chunks)).toEqual(payload);response.close();
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
