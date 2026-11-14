import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {fileURLToPath} from 'node:url';
import {eq} from 'drizzle-orm';
import request from 'supertest';
const state=vi.hoisted(()=>({db:undefined as unknown,detail:vi.fn(),history:vi.fn()}));
vi.mock('../src/lib/db',()=>({getDb:()=>state.db,closeDatabase:async()=>{}}));
vi.mock('../src/lib/opendota/client',()=>({fetchOpenDotaMatch:state.detail,fetchOpenDotaPlayerMatchesSince:state.history,fetchOpenDotaRecentMatches:state.history}));
import {createApp} from '../src/app';
import {users,syncJobs,syncHistoryCache,dotaMatches,matchObservations,companionDevices} from '../src/lib/db/schema';
import {createSession} from '../src/lib/auth/session';
import {registerCompanion,acceptObservation as acceptObservationForSteam,runObservedMatchTick,observationDelay} from '../src/lib/sync/companion';
import {upsertSteamUser} from '../src/lib/auth/user';
import {fetchSelectedHistory,syncManualRangeBatch} from '../src/lib/opendota/service';
import {runScheduledSyncTick} from '../src/lib/sync/service';
import {runManualRangeSyncTick} from '../src/lib/sync/manual-service';
import {OpenDotaError} from '../src/lib/opendota/errors';
import {toJournalDateKey} from '../src/lib/journal/timezone';
const pg=new PGlite(),db=drizzle(pg);state.db=db;let userId='',appToken='';
const account=12345,id=9070000123;
const steamId='76561197960278073';
const acceptObservation=(token:string,matchId:number,endedAt:Date,target=steamId)=>
  acceptObservationForSteam(token,matchId,endedAt,target);
const full=(matchId:number)=>({match_id:matchId,start_time:Math.floor(Date.now()/1000)-1800,duration:1200,radiant_win:true,game_mode:23,lobby_type:0,players:[{account_id:account,player_slot:0,hero_id:1,kills:1,deaths:2,assists:3}]});
beforeAll(async()=>{vi.stubEnv('APP_URL','https://test.example');vi.stubEnv('SYNC_WORKER_SECRET','s'.repeat(43));await migrate(db,{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
 const [user]=await db.insert(users).values({steamId,steamAccountId:account,handle:'automatic_test',displayName:'Automatic',onboardingCompletedAt:new Date()}).returning();userId=user.id;appToken=(await createSession(userId)).token;
},60000);
beforeEach(async()=>{vi.clearAllMocks();await pg.exec('DELETE FROM match_observations; DELETE FROM companion_devices; DELETE FROM sync_history_cache; DELETE FROM sync_jobs; UPDATE users SET companion_lookup_count=0,companion_report_count=0;');state.detail.mockImplementation(async(n:number)=>full(n));state.history.mockResolvedValue([]);});
afterAll(async()=>{await pg.close();vi.unstubAllEnvs();});
describe('independent match discovery and durable provider snapshots',()=>{
 it('starts a three-day history job when Steam identity is saved, before onboarding finishes',async()=>{
  const created=await upsertSteamUser({steamId:'76561197960278074',accountId:12346,
    displayName:'New player',avatarUrl:null,profileUrl:'https://steamcommunity.com/id/test'});
  try {
    expect(created.onboardingCompletedAt).toBeNull();
    const [job]=await db.select().from(syncJobs).where(eq(syncJobs.userId,created.id));
    expect(job.status).toBe('pending');
    expect(job.manualRequest).toMatchObject({source:'signup',mode:'basic'});
    const cutoff=Date.parse(String(job.manualRequest?.cutoff));
    expect(cutoff).toBeGreaterThan(Date.now()-3*86400000-60000);
    expect(cutoff).toBeLessThan(Date.now()-3*86400000+60000);
  } finally { await db.delete(users).where(eq(users.id,created.id)); }
 });
 it('retries a signup match that the provider has not prepared yet',async()=>{
  const created=await upsertSteamUser({steamId:'76561197960278077',accountId:12349,
    displayName:'Delayed player',avatarUrl:null,profileUrl:'https://steamcommunity.com/id/test'});
  const pendingId=id+900;
  state.history.mockResolvedValue([{match_id:pendingId,start_time:Math.floor(Date.now()/1000)-3600,
    duration:1200,player_slot:0,hero_id:1,radiant_win:true,game_mode:23,lobby_type:0}]);
  state.detail.mockRejectedValueOnce(new OpenDotaError(404,'opendota_match_not_found','Not ready'));
  try {
    expect(await runManualRangeSyncTick()).toMatchObject({processed:1,status:'pending'});
    const [first]=await db.select().from(syncJobs).where(eq(syncJobs.userId,created.id));
    expect(first.manualAttempted).not.toContain(pendingId);
    expect(first.manualResult?.failed).toMatchObject([{dotaMatchId:pendingId,code:'opendota_match_not_found'}]);
    expect(first.runAfter.getTime()-Date.now()).toBeGreaterThan(14*60_000);
    state.detail.mockResolvedValue({...full(pendingId),players:[{account_id:12349,player_slot:0,hero_id:1,kills:1,deaths:2,assists:3}]});
    await db.update(syncJobs).set({runAfter:new Date(Date.now()-1000)}).where(eq(syncJobs.id,first.id));
    expect(await runManualRangeSyncTick()).toMatchObject({processed:1,status:'completed'});
    const [last]=await db.select().from(syncJobs).where(eq(syncJobs.id,first.id));
    expect(last.manualResult?.failed).toEqual([]);
    expect(last.manualResult?.imported).toHaveLength(1);
  } finally { await db.delete(users).where(eq(users.id,created.id)); }
 });
 it('routes a verified device observation to any registered Steam account and ignores unknown IDs',async()=>{
  const [other]=await db.insert(users).values({steamId:'76561197960278075',steamAccountId:12347,
    handle:'automatic_second',displayName:'Second'}).returning();
  try {
    const grant=await registerCompanion(userId),app=createApp();
    const registered=await request(app).post('/api/sync/companion/eligibility')
      .set('Authorization',`Bearer ${grant.token}`).send({steamId:'76561197960278075'});
    expect(registered.body.registered).toBe(true);
    expect((await request(app).post('/api/sync/companion/eligibility')
      .set('Authorization',`Bearer ${grant.token}`).send({steamId:'76561197960278076'})).body.registered).toBe(false);
    await acceptObservation(grant.token!,id,new Date(),'76561197960278075');
    expect((await db.select().from(matchObservations))[0].userId).toBe(other.id);
    expect(await acceptObservation(grant.token!,id+1,new Date(),'76561197960278076'))
      .toEqual({accepted:false,status:'ignored'});
    expect(await db.select().from(matchObservations)).toHaveLength(1);
  } finally { await db.delete(users).where(eq(users.id,other.id)); }
 });
 it('limits account checks and reports per device across target accounts',async()=>{
  const grant=await registerCompanion(userId),app=createApp();
  await db.update(companionDevices).set({lookupCount:5000,lookupWindowAt:new Date()})
    .where(eq(companionDevices.id,grant.deviceId));
  const lookup=await request(app).post('/api/sync/companion/eligibility')
    .set('Authorization',`Bearer ${grant.token}`).send({steamId});
  expect(lookup.status).toBe(429);
  await db.update(companionDevices).set({reportCount:100,reportWindowAt:new Date()})
    .where(eq(companionDevices.id,grant.deviceId));
  await expect(acceptObservation(grant.token!,id+500,new Date()))
    .rejects.toMatchObject({status:429,code:'companion_device_daily_limit'});
  expect(await db.select().from(matchObservations)).toHaveLength(0);
 });
 it('shares Companion quotas across devices and caps active registrations',async()=>{
  const first=await registerCompanion(userId),second=await registerCompanion(userId),app=createApp();
  await db.update(users).set({companionLookupCount:5000,companionLookupWindowAt:new Date()}).where(eq(users.id,userId));
  const lookup=await request(app).post('/api/sync/companion/eligibility')
    .set('Authorization',`Bearer ${second.token}`).send({steamId});
  expect(lookup.status).toBe(429);
  await db.update(users).set({companionReportCount:100,companionReportWindowAt:new Date()}).where(eq(users.id,userId));
  await expect(acceptObservation(second.token!,id+800,new Date()))
    .rejects.toMatchObject({status:429,code:'companion_device_daily_limit'});
  for(let n=2;n<16;n++)await registerCompanion(userId);
  await expect(registerCompanion(userId)).rejects.toMatchObject({status:429,code:'companion_device_limit'});
  expect(await registerCompanion(userId,first.deviceId)).toMatchObject({deviceId:first.deviceId,token:null});
 });
 it('continues scheduled history in bounded batches until more than twenty matches are visited',async()=>{
  const history=Array.from({length:25},(_,n)=>({match_id:id+100+n,
    start_time:Math.floor(Date.now()/1000)-3600+n,duration:1200,
    player_slot:0,hero_id:1,radiant_win:true,game_mode:23,lobby_type:0}));
  state.history.mockResolvedValue(history);
  const first=await runScheduledSyncTick();
  expect(first.jobs[0]).toMatchObject({status:'pending'});
  const [queued]=await db.select().from(syncJobs).where(eq(syncJobs.userId,userId));
  expect(queued.manualAttempted).toHaveLength(20);
  await db.update(syncJobs).set({runAfter:new Date(Date.now()-1000)}).where(eq(syncJobs.id,queued.id));
  const second=await runScheduledSyncTick();
  expect(second.jobs[0]).toMatchObject({status:'completed'});
  const [finished]=await db.select().from(syncJobs).where(eq(syncJobs.id,queued.id));
  expect(finished.status).toBe('completed');
  expect(state.detail).toHaveBeenCalledTimes(25);
 });
 it('keeps scoped credentials out of session access and schedules exactly five minutes after the end',async()=>{
  const grant=await registerCompanion(userId);const endedAt=new Date();await acceptObservation(grant.token!,id,endedAt);await acceptObservation(grant.token!,id,endedAt);
  const rows=await db.select().from(matchObservations);expect(rows).toHaveLength(1);expect(rows[0].runAfter.getTime()-endedAt.getTime()).toBe(300000);
  expect((await db.select().from(companionDevices))[0].tokenHash).not.toBe(grant.token);
  expect((await request(createApp()).get('/api/auth/session').set('Authorization',`Bearer ${grant.token}`)).body).toEqual({authenticated:false});
  expect(await runObservedMatchTick()).toEqual({processed:0});expect(state.detail).not.toHaveBeenCalled();
 });
 it('reuses a running device credential when the UI reopens',async()=>{
  const first=await registerCompanion(userId);const next=await registerCompanion(userId,first.deviceId);
  expect(next).toEqual({deviceId:first.deviceId,token:null});await expect(acceptObservation(first.token!,id,new Date())).resolves.toMatchObject({accepted:true});
 });
 it('requires scoped authentication, bounds reported times and accepts a native millisecond timestamp',async()=>{
  const grant=await registerCompanion(userId),app=createApp(),event={matchId:id,endedAt:Date.now(),steamId};
  expect((await request(app).post('/api/sync/observations').set('Authorization',`Bearer ${appToken}`).send(event)).status).toBe(401);
  expect((await request(app).post('/api/sync/observations').set('Authorization',`Bearer ${grant.token}`).send({...event,endedAt:Date.now()+600000})).status).toBe(400);
  expect((await request(app).post('/api/sync/observations').set('Authorization',`Bearer ${grant.token}`).send({...event,endedAt:8640000000000001})).status).toBe(400);
  expect((await request(app).post('/api/sync/observations').set('Authorization',`Bearer ${grant.token}`).send(event)).status).toBe(202);
  expect((await request(app).delete('/api/sync/companion').set('Authorization',`Bearer ${grant.token}`)).status).toBe(204);
  await expect(acceptObservation(grant.token!,id+1,new Date())).rejects.toMatchObject({status:401});
 });
 it('counts old observations by server receipt time across devices and keeps duplicate reporting idempotent',async()=>{
  const first=await registerCompanion(userId),second=await registerCompanion(userId),endedAt=new Date(Date.now()-2*86400000);
  for(let n=0;n<100;n++)await acceptObservation((n%2?first:second).token!,id+n,endedAt);
  await expect(acceptObservation(second.token!,id,endedAt)).resolves.toMatchObject({accepted:true});
  await expect(acceptObservation(first.token!,id+100,endedAt)).rejects.toMatchObject({status:429,code:'companion_device_daily_limit'});
  expect(await db.select().from(matchObservations)).toHaveLength(100);
 });
 it('imports after the delay, verifies player identity and reuses a globally cached full match',async()=>{
  const matchId=id+1,grant=await registerCompanion(userId);await db.insert(dotaMatches).values({matchId,startedAt:new Date(),rawData:full(matchId)}).onConflictDoNothing();
  await acceptObservation(grant.token!,matchId,new Date(Date.now()-600000));expect(await runObservedMatchTick()).toMatchObject({processed:1,status:'completed'});expect(state.detail).not.toHaveBeenCalled();
  expect((await db.select().from(matchObservations))[0].status).toBe('completed');
 });
 it('retries missing data with bounded backoff, then retires expired work',async()=>{
  const grant=await registerCompanion(userId);state.detail.mockRejectedValue(new Error('provider unavailable'));await acceptObservation(grant.token!,id+2,new Date(Date.now()-600000));
  expect(await runObservedMatchTick()).toMatchObject({status:'pending'});const [row]=await db.select().from(matchObservations);expect(row.attempts).toBe(1);expect(row.runAfter.getTime()-Date.now()).toBeGreaterThan(175000);
  await pg.exec("UPDATE match_observations SET deadline_at=now()-interval '1 second'");expect(await runObservedMatchTick()).toEqual({processed:0});expect((await db.select().from(matchObservations))[0].status).toBe('failed');expect(observationDelay(50)).toBe(1800);
 });
 it('enumerates once, reuses the scan for day/week requests and refreshes the recent overlap',async()=>{
  const today=toJournalDateKey(new Date()),range={from:today,to:today};const first={match_id:id,start_time:Math.floor(Date.now()/1000),duration:1200,player_slot:0,hero_id:1,radiant_win:true};state.history.mockResolvedValue([first]);
  const user={id:userId,steamAccountId:account};const snapshot=await fetchSelectedHistory(user,range);await fetchSelectedHistory(user,range);expect(state.history).toHaveBeenCalledTimes(1);
  await db.update(syncHistoryCache).set({reconciledAt:new Date(Date.now()-120000)}).where(eq(syncHistoryCache.userId,userId));state.history.mockResolvedValue([{...first,match_id:id+10}]);
  const merged=await fetchSelectedHistory(user,range);expect(merged).toHaveLength(2);expect(state.history).toHaveBeenCalledTimes(2);
  state.history.mockClear();await syncManualRangeBatch({...user,createdAt:new Date()}, {...range,scope:'day',mode:'basic'},[],20,snapshot);expect(state.history).not.toHaveBeenCalled();
 });
 it('keeps Tehran midnight matches on the starting day',()=>{
  expect(toJournalDateKey(new Date('2026-11-07T20:25:00Z'))).toBe('2026-11-07');expect(toJournalDateKey(new Date('2026-11-07T20:35:00Z'))).toBe('2026-11-08');
 });
});
