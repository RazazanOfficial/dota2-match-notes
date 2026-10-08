// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {webcrypto} from "node:crypto";
import {apiRequest,setBearer,currentSession} from "../src/api";
import {cachedRead,cachedWrite,cacheOwner,clearOfflineAccount,saveOfflineSession,restoreOfflineSession,setCacheOwner,cachedHistory} from "../src/offlineCache";
import {connectionState,setConnection} from "../src/connection";
import {sampleHistory,summarize,SAMPLE_DATE} from "../src/history";
const session={mode:"player" as const,username:"steam_100",steamId:"76561197960265828",steamAccountId:100,onboardingCompletedAt:"2026-10-01T00:00:00Z"};
beforeEach(()=>{localStorage.clear();clearOfflineAccount();setConnection("online");setBearer("token-a");vi.stubGlobal("crypto",webcrypto);});
afterEach(()=>{clearOfflineAccount();setBearer(null);vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("account-bound offline snapshots",()=>{
 it("restores the profile only for the exact stored native token, without storing the token",async()=>{
  await saveOfflineSession("token-a",session);expect(localStorage.getItem("dota-notes.offline.v1.session")).not.toContain("token-a");
  expect(await restoreOfflineSession("token-a")).toEqual(session);expect(await restoreOfflineSession("token-b")).toBeNull();
 });
 it("uses cached reads during outages and refuses writes without enqueueing them",async()=>{
  setCacheOwner(session.steamId);cachedWrite("/api/matches/me?from=2026-10-01&to=2026-10-07",{rows:[{id:"1"}]});
  const fetch=vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));vi.stubGlobal("fetch",fetch);
  expect(await apiRequest("/api/matches/me?from=2026-10-01&to=2026-10-07")).toEqual({rows:[{id:"1"}]});expect(connectionState()).toBe("offline");
  await expect(apiRequest("/api/sync/me",{method:"POST",body:"{}"})).rejects.toMatchObject({code:"offline_mode"});expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("never substitutes cached data for a rejected session or client error",async()=>{
  setCacheOwner(session.steamId);cachedWrite("/api/sync/me",{private:true});vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:{code:"unauthorized"}},{status:401})));
  await expect(apiRequest("/api/sync/me")).rejects.toMatchObject({status:401});expect(cachedRead("/api/sync/me")).toBeNull();expect(cacheOwner()).toBe("");
 });
 it("keeps accounts isolated and does not cache a response after switching accounts",async()=>{
  setCacheOwner("a");cachedWrite("/api/sync/me",{account:"a"});setCacheOwner("b");expect(cachedRead("/api/sync/me")).toBeNull();
  let resolve!:(value:Response)=>void;vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>new Promise(r=>resolve=r)));
  const request=apiRequest("/api/sync/me");setBearer("new-token");resolve(Response.json({account:"a"}));await expect(request).rejects.toMatchObject({name:"AbortError"});expect(cachedRead("/api/sync/me")).toBeNull();
 });
 it("seeds a differently-sized view and combined filters from known rows",()=>{
  setCacheOwner(session.steamId);const rows=sampleHistory.slice(0,20);const data={ok:true,rows,total:28,page:1,pageSize:20,summary:summarize(rows)};
  cachedWrite("/api/matches/me?from=2026-09-26&to=2026-10-02&page=1&pageSize=20&query=&mode=all&position=all&hero=all",data);
  const query={period:"week" as const,anchor:SAMPLE_DATE,page:1,pageSize:10,query:"",mode:"all",position:"all"};
  expect(cachedHistory(query)?.rows).toHaveLength(10);
  expect(cachedHistory({...query,hero:String(rows[0].heroId),position:String(rows[0].position)},true)?.rows.every(row=>row.heroId===rows[0].heroId && row.position===rows[0].position)).toBe(true);
 });
 it("uses the newest snapshot when the same row was cached through different page sizes",()=>{
  setCacheOwner(session.steamId);const row=sampleHistory[0];
  const base="/api/matches/me?from=2026-09-26&to=2026-10-02&page=1&query=&mode=all&position=all&hero=all";
  cachedWrite(base+"&pageSize=10",{rows:[{...row,score:10}],total:1,summary:summarize([row])});
  cachedWrite(base+"&pageSize=20",{rows:[{...row,score:20}],total:1,summary:summarize([row])});
  cachedWrite(base+"&pageSize=10",{rows:[{...row,score:90}],total:1,summary:summarize([row])});
  expect(cachedHistory({period:"week",anchor:SAMPLE_DATE,page:1,query:"",mode:"all",position:"all"})?.rows[0].score).toBe(90);
 });
 it("does not restore an identity after logout while its fingerprint is still being checked",async()=>{
  await saveOfflineSession("token-a",session);const digest=await webcrypto.subtle.digest("SHA-256",new TextEncoder().encode("token-a"));
  let resolve!:(v:ArrayBuffer)=>void;vi.stubGlobal("crypto",{subtle:{digest:()=>new Promise(r=>resolve=r)}});
  const restore=restoreOfflineSession("token-a");clearOfflineAccount();resolve(digest);expect(await restore).toBeNull();expect(cacheOwner()).toBe("");
 });
 it("invalidates the offline identity for an unauthenticated session response even with HTTP 200",async()=>{
  await saveOfflineSession("token-a",session);vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({authenticated:false})));
  await expect(currentSession()).rejects.toMatchObject({status:401});expect(await restoreOfflineSession("token-a")).toBeNull();expect(cacheOwner()).toBe("");
 });
 it("clears snapshots on logout and ignores corrupt storage",async()=>{
  await saveOfflineSession("token-a",session);cachedWrite("/api/sync/me",{x:1});clearOfflineAccount();expect(await restoreOfflineSession("token-a")).toBeNull();expect(cachedRead("/api/sync/me")).toBeNull();
  setCacheOwner(session.steamId);localStorage.setItem(`dota-notes.offline.v1.${session.steamId}.data./api/sync/me`,"{");expect(cachedRead("/api/sync/me")).toBeNull();
 });
});
