import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../src/lib/db", () => ({ getDb: () => state.db, closeDatabase: async () => {} }));
import { createApp } from "../src/app";
import { users, sessions, syncJobs, journalDays, journalMatches, dotaMatches, localReplayJobs, monthlyReferenceVersions } from "../src/lib/db/schema";
import { loadPublicMatchAnalysis } from "../src/lib/dota/match-analysis-repository";
import { createSession } from "../src/lib/auth/session";
import { createDesktopAuthCode } from "../src/lib/auth/desktop";
import { createHash } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password";
import { claimManualOpenDotaSync, releaseManualOpenDotaSyncClaim } from "../src/lib/opendota/repository";
import { verifyDatabaseSchema } from "../src/lib/db/compatibility";
import { manualMatchSyncInputSchema } from "../src/lib/opendota/sync-request";
import { SESSION_COOKIE } from "../src/lib/auth/config";
import { saturdayWeekStart } from "../src/lib/opendota/sync-request";
import { toJournalDateKey } from "../src/lib/journal/timezone";

const client = new PGlite(); const db = drizzle(client); state.db = db;
const apiFolder = fileURLToPath(new URL("..", import.meta.url));
const migrationFolder = join(apiFolder, "drizzle");
let userId = ""; let cookie = ""; let oldFolder = "";
const password = "correct-test-password";

beforeAll(async () => {
  vi.stubEnv("APP_URL", "https://dota.example"); vi.stubEnv("API_ALLOWED_ORIGINS", "http://localhost:1420");
  vi.stubEnv("SYNC_WORKER_SECRET", "integration-test-worker-secret-123456789");
  oldFolder = await mkdtemp(join(tmpdir(), "dota-old-schema-")); await mkdir(join(oldFolder,"meta"));
  const journal = JSON.parse(await readFile(join(migrationFolder,"meta/_journal.json"),"utf8"));
  const old = { ...journal, entries: journal.entries.slice(0,24) };
  await writeFile(join(oldFolder,"meta/_journal.json"), JSON.stringify(old));
  for (const entry of old.entries) await copyFile(join(migrationFolder,entry.tag+".sql"),join(oldFolder,entry.tag+".sql"));
  await migrate(db, { migrationsFolder: oldFolder });
  const inserted = await client.query<{id:string}>("INSERT INTO users(steam_id,steam_account_id,handle,display_name,password_hash,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", ["76561197960265729",1,"legacy_user","Legacy user",await hashPassword(password),"2026-09-15T12:00:00Z"]);
  userId=inserted.rows[0].id;
  await db.insert(journalDays).values({userId,day:"2026-09-15",completed:true});
  await migrate(db, { migrationsFolder: migrationFolder });
  await migrate(db, { migrationsFolder: migrationFolder });
  const session=await createSession(userId);cookie=`${SESSION_COOKIE}=${session.token}`;
},60_000);
afterAll(async () => { await client.close(); if(oldFolder) await rm(oldFolder,{recursive:true,force:true}); vi.unstubAllEnvs(); });

describe("PostgreSQL schema migration and real Express services", () => {
  it("upgrades the old schema twice without losing users or journal data", async () => {
    const [user]=await db.select().from(users).where(eq(users.id,userId));
    expect(user.displayName).toBe("Legacy user");expect(user.lastMonthSyncAt).toBeNull();
    expect(user.onboardingCompletedAt).not.toBeNull();
    expect((await db.select().from(journalDays).where(eq(journalDays.userId,userId)))[0].completed).toBe(true);
    const result=await verifyDatabaseSchema();expect(result.tables).toBeGreaterThan(20);
  });
  it("authenticates a persisted hashed session without leaking the password hash", async () => {
    const result=await request(createApp()).get("/api/auth/session").set("Cookie",cookie);
    expect(result.body.authenticated).toBe(true);expect(result.body.user.id).toBe(userId);
    expect(result.body.user.passwordHash).toBeUndefined();expect(result.body.user.hasPassword).toBe(true);
  });
  it("keeps an interrupted Steam signup provisional across sessions until completion", async () => {
    const [provisional] = await db.insert(users).values({ steamId: "76561197960265730", steamAccountId: 2, handle: "provisional_user", displayName: "Provisional" }).returning({ id: users.id });
    try {
      const first = await createSession(provisional.id);
      const app = createApp();
      expect((await request(app).get("/api/auth/session").auth(first.token,{type:"bearer"})).body.user.onboardingCompletedAt).toBeNull();
      expect((await request(app).get("/api/matches/me?from=2026-09-12&to=2026-09-18").auth(first.token,{type:"bearer"})).body.error.code).toBe("onboarding_required");
      expect((await request(app).post("/api/auth/signup/complete").auth(first.token,{type:"bearer"})).status).toBe(409);
      await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, provisional.id));
      const second = await createSession(provisional.id);
      expect((await request(app).get("/api/auth/session").auth(second.token,{type:"bearer"})).body.user.onboardingCompletedAt).toBeNull();
      expect((await request(app).get("/api/matches/me?from=2026-09-12&to=2026-09-18").auth(second.token,{type:"bearer"})).status).toBe(409);
      expect((await request(app).post("/api/auth/signup/complete").auth(second.token,{type:"bearer"})).status).toBe(409);
      const issued = await request(app).post("/api/auth/signup/codes/reissue").auth(second.token,{type:"bearer"}).send({ password });
      expect(issued.status).toBe(200);
      expect(issued.body.recoveryCodes).toHaveLength(6);
      expect((await request(app).post("/api/auth/signup/codes/saved").auth(second.token,{type:"bearer"})).status).toBe(200);
      const completed = await request(app).post("/api/auth/signup/complete").auth(second.token,{type:"bearer"});
      expect(completed.status).toBe(200);
      expect(completed.body.alreadyCompleted).toBe(false);
      expect((await request(app).get("/api/auth/session").auth(first.token,{type:"bearer"})).body.user.onboardingCompletedAt).toBeTruthy();
      expect((await request(app).get("/api/matches/me?from=2026-09-12&to=2026-09-18").auth(second.token,{type:"bearer"})).status).toBe(200);
      expect((await request(app).post("/api/auth/signup/complete").auth(second.token,{type:"bearer"})).body.alreadyCompleted).toBe(true);
    } finally { await db.delete(users).where(eq(users.id, provisional.id)); }
  }, 30_000);
  it("performs password login through the actual route, DB and bcrypt", async () => {
    const result=await request(createApp()).post("/api/auth/password/login").set("Origin","https://dota.example").send({steamIdentifier:"1",password});
    expect(result.status).toBe(200);expect(result.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(result.headers["set-cookie"][0]).toContain("Secure");
  });
  it("issues and revokes an opaque bearer session for a native client", async () => {
    const app=createApp();
    const login=await request(app).post("/api/auth/password/login?session=bearer").send({steamIdentifier:"1",password});
    expect(login.status).toBe(200);expect(login.headers["set-cookie"]).toBeUndefined();
    expect(login.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const token=login.body.token;
    expect((await request(app).get("/api/auth/session").auth(token,{type:"bearer"})).body.authenticated).toBe(true);
    expect((await request(app).post("/api/auth/logout").auth(token,{type:"bearer"})).status).toBe(200);
    expect((await request(app).get("/api/auth/session").auth(token,{type:"bearer"})).body.authenticated).toBe(false);
  });
  it("exchanges one short-lived desktop PKCE code once without a browser cookie", async () => {
    const verifier = "v".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const code = await createDesktopAuthCode(userId, challenge);
    const app = createApp();
    const wrong = await request(app).post("/api/auth/desktop/exchange").send({ code, verifier: "x".repeat(43) });
    expect(wrong.status).toBe(400);
    const exchanged = await request(app).post("/api/auth/desktop/exchange").send({ code, verifier });
    expect(exchanged.status).toBe(200);
    expect(exchanged.headers["set-cookie"]).toBeUndefined();
    expect(exchanged.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await request(app).get("/api/auth/session").auth(exchanged.body.token,{type:"bearer"})).body.user.id).toBe(userId);
    expect((await request(app).post("/api/auth/desktop/exchange").send({ code, verifier })).status).toBe(400);
  });
  it("returns compact filtered match pages and period distribution to the desktop", async () => {
    const [day] = await db.select({ id: journalDays.id }).from(journalDays).where(eq(journalDays.day,"2026-09-15"));
    await db.insert(dotaMatches).values({ matchId: 9000001234, startedAt: new Date("2026-09-15T12:00:00Z"),
      durationSeconds: 2200, gameMode: 22, lobbyType: 7 });
    const [entry] = await db.insert(journalMatches).values({ userId, dayId: day.id, number: 1,
      dotaMatchId: 9000001234, heroId: 1, heroName: "Anti-Mage", role: "safe_lane", result: "win",
      startedAt: new Date("2026-09-15T12:00:00Z"), durationSeconds: 2200, kills: 8, deaths: 2, assists: 14 }).returning({ id: journalMatches.id });
    const app = createApp();
    const base = "/api/matches/me?from=2026-09-12&to=2026-09-18&query=Anti&mode=Ranked&position=1";
    const first = await request(app).get(`${base}&page=1`).set("Cookie",cookie);
    expect(first.status).toBe(200);
    expect(first.body.rows).toMatchObject([{ id: "9000001234", journalId: entry.id, k: 8, position: 1 }]);
    expect(first.body.summary).toMatchObject({ total: 1, wins: 1, heroes: [{ id: 1, count: 1 }], positions: [{ id: 1, count: 1 }] });
    expect(first.body.pageSize).toBe(10);
    expect((await request(app).get(`${base}&hero=1&pageSize=100`).set("Cookie",cookie)).body.total).toBe(1);
    expect((await request(app).get(`${base}&hero=8`).set("Cookie",cookie)).body.total).toBe(0);
    expect((await request(app).get(`${base}&offset=1&pageSize=10`).set("Cookie",cookie)).body.rows).toEqual([]);
    for (const parameter of ["pageSize=101","pageSize=0","offset=-1","hero=NaN"]) expect((await request(app).get(`${base}&${parameter}`).set("Cookie",cookie)).status).toBe(400);
    await db.update(dotaMatches).set({rawData:{match_id:9000001234,players:[{account_id:1,hero_id:1,player_slot:0,item_0:50,item_1:36,item_2:108,item_3:247,item_4:609,item_5:1,permanent_buffs:[{permanent_buff:5,stack_count:64}],private_payload:"not_for_history"}]}}).where(eq(dotaMatches.matchId,9000001234));
    const inventory=await request(app).get(base).set("Cookie",cookie);
    expect(inventory.body.rows[0].itemIds).toEqual([50,36,108,247,609,1]);
    expect(inventory.body.rows[0].buffs).toMatchObject([{key:"legion_commander_duel",stacks:64}]);
    expect(JSON.stringify(inventory.body)).not.toContain("not_for_history");

    const next = await request(app).get(`${base}&page=2`).set("Cookie",cookie);
    expect(next.body.rows).toEqual([]);expect(next.body.total).toBe(1);
    expect((await request(app).get(base.replace("mode=Ranked", "mode=Turbo")).set("Cookie",cookie)).body.total).toBe(0);
    expect((await request(app).get(base)).status).toBe(401);
    await db.delete(journalMatches).where(eq(journalMatches.id,entry.id));
    await db.delete(dotaMatches).where(eq(dotaMatches.matchId,9000001234));
  });
  it("projects the real replay score/position, keeps unknown matches and refreshes invalidated results", async () => {
    const [owner] = await db.insert(users).values({ steamId: "76561197960265828", steamAccountId: 100, handle: "analysis_history_test", displayName: "History test", createdAt: new Date("2026-09-15"), onboardingCompletedAt: new Date() }).returning({ id: users.id });
    const [day] = await db.insert(journalDays).values({ userId: owner.id, day: "2026-09-15" }).returning({ id: journalDays.id });
    const token = (await createSession(owner.id)).token, app = createApp();
    const ids = [9100001001, 9100001002, 9100001003];
    let snapshotId = "";
    try {
      const start = new Date("2026-09-15T12:00:00Z");
      const players = Array.from({ length: 10 }, (_, i) => ({ account_id: 100 + i, hero_id: i + 1, player_slot: i < 5 ? i : 123 + i,
        kills: 8, deaths: 2, assists: 10, last_hits: 150, denies: 10, gold_per_min: 450, xp_per_min: 520,
        times: [0,60,120], gold_t: [600,1000,1400], xp_t: [0,500,1000], lh_t: [0,5,10],
        benchmarks: { gold_per_min: { raw: 450, pct: .8 }, xp_per_min: { raw: 520, pct: .7 }, last_hits_per_min: { raw: 5, pct: .75 } } }));
      await db.insert(dotaMatches).values([
        { matchId: ids[0], startedAt: start, rawData: { match_id: ids[0], start_time: start.getTime()/1000, duration: 1800, radiant_win: true, version: 1, game_mode: 22, lobby_type: 7, players }, gameMode: 22, lobbyType: 7 },
        { matchId: ids[1], startedAt: start, rawData: { match_id: ids[1], players: [] }, gameMode: 23, lobbyType: 0 },
        { matchId: ids[2], startedAt: start, rawData: { match_id: ids[2], players: [] }, gameMode: 2, lobbyType: 0 },
      ]);
      const entries = await db.insert(journalMatches).values(ids.map((id, i) => ({ userId: owner.id, dayId: day.id, number: i+1, dotaMatchId: id,
        heroId: 1, heroName: "Anti-Mage", result: "win" as const, startedAt: start, durationSeconds: 1800, analyzedAt: new Date(), positionOverrides: i === 0 ? { "0": 2 } : {} }))).returning({ id: journalMatches.id });
      await db.insert(localReplayJobs).values({ matchId: ids[1], status: "pending", intent: "analysis" });
      const base = "/api/matches/me?from=2026-09-12&to=2026-09-18";
      const get = (extra = "") => request(app).get(base+extra).auth(token,{type:"bearer"});
      const result = await get(); expect(result.status).toBe(200); expect(result.body.summaryPending).toBe(false);
      const full = await loadPublicMatchAnalysis(entries[0].id), profile = full.analysis!.players.find(p => p.isProfilePlayer)!;
      expect(profile.performanceScore).toBeTypeOf("number"); expect(profile.position).toBe(2);
      expect(result.body.rows.find((row: {id:string}) => row.id === String(ids[0]))).toMatchObject({ analyzed: true, position: 2, score: profile.performanceScore, analysisStatus: "ready" });
      // An algorithm update must replace old compact summaries, even though
      // the raw replay/reference/overrides did not change.
      const [oldProjection] = await db.select({ value: journalMatches.analysisSummary }).from(journalMatches).where(eq(journalMatches.id, entries[0].id));
      await db.update(journalMatches).set({ analysisSummary: { ...oldProjection.value!, version: 1, position: 0, score: -1 } }).where(eq(journalMatches.id, entries[0].id));
      expect((await get()).body.rows.find((row:{id:string})=>row.id===String(ids[0]))).toMatchObject({ position: 2, score: profile.performanceScore });
      const [refreshedProjection] = await db.select({ value: journalMatches.analysisSummary }).from(journalMatches).where(eq(journalMatches.id, entries[0].id));
      expect(refreshedProjection.value?.version).toBe(2);
      expect(result.body.rows.find((row: {id:string}) => row.id === String(ids[1]))).toMatchObject({ analyzed: false, position: null, score: null, analysisStatus: "pending" });
      expect(result.body.rows.find((row: {id:string}) => row.id === String(ids[1])).analysisPreparation).toMatchObject({ replay: "pending", progress: { phase: "queued" } });
      await db.update(localReplayJobs).set({ status: "processing", phase: "downloading", downloadedBytes: 512, totalBytes: 1024 }).where(eq(localReplayJobs.matchId, ids[1]));
      expect((await get()).body.rows.find((row:{id:string})=>row.id===String(ids[1])).analysisPreparation).toMatchObject({ replay: "processing", progress: { phase: "downloading", bytes: 512, totalBytes: 1024 } });
      await db.update(localReplayJobs).set({ status: "failed", phase: "failed", errorCode: "replay_identity_mismatch", errorMessage: "private operator diagnostic" }).where(eq(localReplayJobs.matchId, ids[1]));
      const failed = (await get()).body;
      expect(failed.rows.find((row:{id:string})=>row.id===String(ids[1])).analysisPreparation).toMatchObject({ replay: "failed", errorCode: "replay_identity_mismatch" });
      expect(JSON.stringify(failed)).not.toContain("private operator diagnostic");
      // A parsed result does not hide the worker's remaining save stage.
      await db.insert(localReplayJobs).values({ matchId: ids[0], intent: "analysis", status: "processing", phase: "uploading" });
      expect((await get()).body.rows.find((row:{id:string})=>row.id===String(ids[0]))).toMatchObject({ analyzed: true, analysisStatus: "processing", analysisPreparation: { replay: "processing", progress: { phase: "uploading" } } });
      await db.delete(localReplayJobs).where(eq(localReplayJobs.matchId, ids[0]));
      expect(result.body.summary.positions).toEqual(expect.arrayContaining([{ id: 0, count: 2, wins: 2, losses: 0 }, { id: 2, count: 1, wins: 1, losses: 0 }]));
      expect((await get("&position=0")).body.total).toBe(2);
      expect((await get("&mode=Captains%20Mode")).body.rows.map((row:{id:string})=>row.id)).toEqual([String(ids[2])]);
      expect(JSON.stringify(result.body)).not.toContain("gold_t");
      await db.update(journalMatches).set({ positionOverrides: { "0": 3 } }).where(eq(journalMatches.id, entries[0].id));
      expect((await get("&position=3")).body.rows[0]).toMatchObject({ position: 3, analyzed: true });
      const [snapshot] = await db.insert(monthlyReferenceVersions).values({ referenceMonth: "2026-08-01", status: "active", completedAt: new Date() }).returning({ id: monthlyReferenceVersions.id }); snapshotId = snapshot.id;
      expect((await get()).body.summaryPending).toBe(false);
      const [projected] = await db.select({ value: journalMatches.analysisSummary }).from(journalMatches).where(eq(journalMatches.id, entries[0].id));
      expect(projected.value!.referenceRevision).toContain(snapshotId);
      // PostgreSQL retains microseconds; the projection must not be perpetually stale after conversion to JS milliseconds.
      await client.query("update dota_matches set updated_at = '2026-10-07T10:00:00.123456Z' where match_id = $1", [ids[0]]);
      expect((await get()).body.summaryPending).toBe(false);
      // Malformed local replay and an absent source must never claim analysis completion or loop hydration forever.
      await db.update(dotaMatches).set({ localReplayData: { match_id: ids[2], version: 1, players: Array.from({length:10},()=>({})) } }).where(eq(dotaMatches.matchId,ids[2]));
      const malformed = await get(); expect(malformed.body.summaryPending).toBe(false);
      expect(malformed.body.rows.find((row:{id:string})=>row.id===String(ids[2])).analyzed).toBe(false);
      // A cold period is hydrated in bounded batches rather than rebuilding every replay in a single request.
      const extras = Array.from({length:9},(_,i)=>9100001010+i); ids.push(...extras);
      await db.insert(dotaMatches).values(extras.map(matchId=>({matchId,startedAt:start,gameMode:22,lobbyType:7,rawData:{match_id:matchId,start_time:start.getTime()/1000,duration:1800,radiant_win:true,version:1,players}})));
      await db.insert(journalMatches).values(extras.map((dotaMatchId,i)=>({userId:owner.id,dayId:day.id,number:20+i,dotaMatchId,heroId:1,heroName:"Anti-Mage",result:"win" as const,startedAt:start,positionOverrides:{"0":2}})));
      const cold = await get(); expect(cold.body.summaryPending).toBe(true);
      const warm = await get(); expect(warm.body.summaryPending).toBe(false); expect(warm.body.total).toBe(12);
      expect(warm.body.summary.positions.reduce((sum:number,segment:{count:number})=>sum+segment.count,0)).toBe(12);

    } finally {
      await db.delete(users).where(eq(users.id,owner.id));
      for (const id of ids) await db.delete(dotaMatches).where(eq(dotaMatches.matchId,id));
      if (snapshotId) await db.delete(monthlyReferenceVersions).where(eq(monthlyReferenceVersions.id,snapshotId));
    }
  }, 30_000);
  it("uses the same public error for missing accounts and incorrect passwords", async () => {
    const app=createApp();
    const bad=await request(app).post("/api/auth/password/login").send({steamIdentifier:"1",password:"incorrect-password"});
    const missing=await request(app).post("/api/auth/password/login").send({steamIdentifier:"9988",password:"incorrect-password"});
    expect(bad.status).toBe(401);expect(missing.status).toBe(401);expect(bad.body).toEqual(missing.body);
  });
  it("saves and reloads journal data for the authenticated owner", async () => {
    const app=createApp();
    const saved=await request(app).put("/api/journal/days/2026-09-16").set("Cookie",cookie).set("Origin","https://dota.example").send({completed:true,matches:{}});
    expect(saved.status).toBe(200);
    const loaded=await request(app).get("/api/journal/me?from=2026-09-15&to=2026-09-16").set("Cookie",cookie);
    expect(loaded.status).toBe(200);expect(loaded.body.ok).toBe(true);
    expect((await db.select().from(journalDays).where(eq(journalDays.day,"2026-09-16")))[0].userId).toBe(userId);
  });
  it("prevents a normal account from executing administrator actions", async () => {
    const denied=await request(createApp()).get("/api/admin/users").set("Cookie",cookie);
    expect(denied.status).toBe(403);
  });
  it("keeps day, week and month cooldown claims independent", async () => {
    const day=await claimManualOpenDotaSync(userId,90,"day");
    const week=await claimManualOpenDotaSync(userId,180,"week");
    const month=await claimManualOpenDotaSync(userId,7200,"month");
    for(const [scope,seconds] of [["day",90],["week",180],["month",7200]] as const) await expect(claimManualOpenDotaSync(userId,seconds,scope)).rejects.toMatchObject({status:429});
    await releaseManualOpenDotaSyncClaim(userId,day,"day");await releaseManualOpenDotaSyncClaim(userId,week,"week");await releaseManualOpenDotaSyncClaim(userId,month,"month");
  });
  it("rejects pre-registration ranges before consuming cooldowns or queuing jobs", async () => {
    const rejected=await request(createApp()).post("/api/sync/me").set("Cookie",cookie).set("Origin","https://dota.example").send({scope:"day",from:"2026-09-11",to:"2026-09-11",mode:"basic"});
    expect(rejected.status).toBe(400);expect(rejected.body.error.code).toBe("before_tracking_window");
    expect(await db.select().from(syncJobs).where(eq(syncJobs.userId,userId))).toHaveLength(0);
    const [user]=await db.select().from(users).where(eq(users.id,userId));expect(user.lastDaySyncAt).toBeNull();
  });
  it("accepts a monthly request into the real persistent queue and blocks concurrent work", async () => {
    const app=createApp();const payload={scope:"month",from:"2026-09-12",to:"2026-09-30",mode:"basic",gameModes:["ranked"]};
    const result=await request(app).post("/api/sync/me").set("Cookie",cookie).set("Origin","https://dota.example").send(payload);
    expect(result.status).toBe(202);expect(result.body.jobId).toBeDefined();
    const duplicate=await request(app).post("/api/sync/me").set("Cookie",cookie).set("Origin","https://dota.example").send(payload);
    expect(duplicate.status).toBe(409);
    const jobs=await db.select().from(syncJobs).where(eq(syncJobs.userId,userId));expect(jobs).toHaveLength(1);expect(jobs[0].manualRequest).toEqual(payload);
  });
  it("uses Tehran's Saturday boundary when UTC registration is still Friday", async () => {
    const saturday=saturdayWeekStart(toJournalDateKey(new Date()));
    const friday=new Date(`${saturday}T00:00:00Z`);friday.setUTCDate(friday.getUTCDate()-1);
    const priorDay=friday.toISOString().slice(0,10);
    const [lateUser]=await db.insert(users).values({steamId:"76561197960265730",steamAccountId:2,
      handle:"tehran_boundary",displayName:"Timezone boundary",createdAt:new Date(`${priorDay}T21:15:00Z`),onboardingCompletedAt:new Date()}).returning({id:users.id});
    const session=await createSession(lateUser.id);const app=createApp();
    const rejected=await request(app).post("/api/sync/me").auth(session.token,{type:"bearer"}).send({scope:"day",from:priorDay,to:priorDay,mode:"basic"});
    expect(rejected.status).toBe(400);expect(rejected.body.error.code).toBe("before_tracking_window");
    const accepted=await request(app).post("/api/sync/me").auth(session.token,{type:"bearer"}).send({scope:"day",from:saturday,to:saturday,mode:"basic"});
    expect(accepted.status).toBe(202);
  });
  it("rejects month boundaries and bcrypt inputs exceeding 72 UTF-8 bytes", async () => {
    expect(manualMatchSyncInputSchema.safeParse({scope:"month",from:"2026-08-31",to:"2026-09-01",mode:"basic"}).success).toBe(true);
    expect(manualMatchSyncInputSchema.safeParse({scope:"month",from:"2026-09-22",to:"2026-10-01",mode:"basic"}).success).toBe(false);
    const result=await request(createApp()).post("/api/auth/password/login").send({steamIdentifier:"1",password:"ی".repeat(40)});
    expect(result.status).toBe(400);
  });
});
