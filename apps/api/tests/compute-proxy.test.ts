import { createServer, type Server } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { topologyMiddleware } from "../src/http/compute-proxy";
import { COMPUTE_HEADER, type Topology } from "../src/runtime/topology";
const servers:Server[]=[]; const token="a".repeat(43);
async function listen(s:Server) { servers.push(s); await new Promise<void>(resolve=>s.listen(0,"127.0.0.1",resolve));const a=s.address();if(!a||typeof a==="string")throw new Error();return `http://127.0.0.1:${a.port}`; }
function app(config:Partial<Topology>={}) {const a=express();a.use(topologyMiddleware({role:"app",computeOrigin:"http://127.0.0.1:1",computeToken:token,timeoutMs:1000,...config}));a.use((_q,r)=>r.json({local:true}));return a;}
afterEach(async()=>{for(const s of servers.splice(0)){s.closeAllConnections();await new Promise<void>(resolve=>s.close(()=>resolve()));}});
describe("private forwarding",()=>{
 it("keeps reads and enqueue local while Germany is unavailable",async()=>{const a=app();expect((await request(a).get("/api/tasks")).body.local).toBe(true);expect((await request(a).post("/api/sync/me")).body.local).toBe(true);const failure=await request(a).post("/api/replays/lookup").send({});expect(failure.status).toBe(503);expect(failure.body.error.code).toBe("compute_unavailable");expect((await request(a).get("/api/matches/me")).body.local).toBe(true);});
 it("preserves one mutation, its query, cookies and user token while replacing forged hop credentials",async()=>{
  let calls=0;const origin=await listen(createServer(async(q,r)=>{calls++;let body="";for await(const c of q)body+=c;r.setHeader("Content-Type","application/json");r.setHeader("Set-Cookie",["one=1; HttpOnly; Secure","two=2; Secure"]);r.end(JSON.stringify({body,path:q.url,bridge:q.headers[COMPUTE_HEADER],auth:q.headers.authorization,ip:q.headers["x-forwarded-for"]}));}));
  const result=await request(app({computeOrigin:origin})).post("/api/v1/replays/lookup?test=yes").set(COMPUTE_HEADER,"forged").set("Authorization","Bearer user-token").set("X-Forwarded-For","203.0.113.123").send({matchId:9070494281});
  expect(calls).toBe(1);expect(result.body).toMatchObject({path:"/api/v1/replays/lookup?test=yes",bridge:token,auth:"Bearer user-token"});expect(JSON.parse(result.body.body).matchId).toBe(9070494281);expect(result.body.ip).not.toBe("203.0.113.123");expect(result.headers["set-cookie"]).toHaveLength(2);expect(result.headers[COMPUTE_HEADER]).toBeUndefined();
 });
 it("never retries a timed-out mutation",async()=>{let calls=0;const origin=await listen(createServer(()=>{calls++;}));const r=await request(app({computeOrigin:origin,timeoutMs:50})).post("/api/auth/email/start").send({});expect(r.status).toBe(503);expect(r.body.error.code).toBe("compute_timeout");expect(calls).toBe(1);expect(r.text).not.toContain(token);});
 it("blocks Iran workers and unauthorized access to compute",async()=>{expect((await request(app()).post("/api/internal/sync/tick")).status).toBe(404);const a=app({role:"compute"});expect((await request(a).post("/api/auth/email/start")).status).toBe(404);expect((await request(a).post("/api/auth/email/start").set(COMPUTE_HEADER,"wrong")).status).toBe(404);expect((await request(a).post("/api/auth/email/start").set(COMPUTE_HEADER,token)).body.local).toBe(true);expect((await request(a).get("/api/tasks").set(COMPUTE_HEADER,token)).status).toBe(404);});
});
