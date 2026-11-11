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
import {registerCompanion,acceptObservation,runObservedMatchTick,observationDelay} from '../src/lib/sync/companion';
import {fetchSelectedHistory,syncManualRangeBatch} from '../src/lib/opendota/service';
import {toJournalDateKey} from '../src/lib/journal/timezone';
const pg=new PGlite(),db=drizzle(pg);state.db=db;let userId='',appToken='';
const account=12345,id=9070000123;
const full=(matchId:number)=>({match_id:matchId,start_time:Math.floor(Date.now()/1000)-1800,duration:1200,radiant_win:true,game_mode:23,lobby_type:0,players:[{account_id:account,player_slot:0,hero_id:1,kills:1,deaths:2,assists:3}]});
beforeAll(async()=>{vi.stubEnv('APP_URL','https://test.example');vi.stubEnv('SYNC_WORKER_SECRET','s'.repeat(43));await migrate(db,{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
 const [user]=await db.insert(users).values({steamId:'76561197960278073',steamAccountId:account,handle:'automatic_test',displayName:'Automatic',onboardingCompletedAt:new Date()}).returning();userId=user.id;appToken=(await createSession(userId)).token;
},60000);
beforeEach(async()=>{vi.clearAllMocks();await pg.exec('DELETE FROM match_observations; DELETE FROM companion_devices; DELETE FROM sync_history_cache; DELETE FROM sync_jobs;');state.detail.mockImplementation(async(n:number)=>full(n));state.history.mockResolvedValue([]);});
afterAll(async()=>{await pg.close();vi.unstubAllEnvs();});
describe('independent match discovery and durable provider snapshots',()=>{
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
  const grant=await registerCompanion(userId),app=createApp(),event={matchId:id,endedAt:Date.now()};
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
  await expect(acceptObservation(first.token!,id+100,endedAt)).rejects.toMatchObject({status:429,code:'companion_daily_limit'});
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
