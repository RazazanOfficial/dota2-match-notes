import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ upload:vi.fn(), exists:vi.fn(), download:vi.fn(), metadata:vi.fn(), refresh:vi.fn() }));
vi.mock("../scripts/replay-parser/replay-archive.mjs", async original => ({ ...await original(), uploadReplay:mocks.upload, archivedReplayExists:mocks.exists }));
vi.mock("../scripts/replay-parser/replay-transport.mjs", async original => ({ ...await original(), downloadResilient:mocks.download }));
vi.mock("../scripts/replay-parser/replay-metadata.mjs", () => ({ fetchReplayMetadata:mocks.metadata }));
vi.mock("../scripts/replay-parser/refresh-match-metadata.mjs", () => ({ refreshMatchMetadata:mocks.refresh }));
let db, client, worker, folder;
const payload=Buffer.from("PBDEMS2 complete test replay data");
const hash=createHash("sha256").update(payload).digest("hex");
beforeAll(async()=>{
  folder=await mkdtemp(join(tmpdir(),"replay-db-test-"));
  process.env.LOCAL_REPLAY_INCOMING_DIR=folder;
  process.env.LOCAL_REPLAY_PROXY_URL="https://relay.test";
  process.env.LOCAL_REPLAY_PROXY_TOKEN="a".repeat(64);
  worker=await import("../scripts/replay-parser/run-queue.mjs");
  db=new PGlite();
  client={ query:async (query,args=[])=>{if(query.startsWith("SELECT pg_advisory_xact_lock"))return {rows:[],rowCount:0};const r=await db.query(query,args);return {rows:r.rows,rowCount:r.rows.length || r.affectedRows || 0};} };
  await db.exec(`CREATE TABLE dota_matches(match_id bigint PRIMARY KEY,raw_data jsonb,local_replay_data jsonb,started_at timestamptz,fetched_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE local_replay_jobs(match_id bigint PRIMARY KEY REFERENCES dota_matches(match_id),status varchar(16) NOT NULL DEFAULT 'pending',
    intent varchar(16) NOT NULL DEFAULT 'analysis',archive_key text,archive_status varchar(16) NOT NULL DEFAULT 'missing',archive_bytes integer,
    archived_at timestamptz,attempts smallint NOT NULL DEFAULT 0,run_after timestamptz NOT NULL DEFAULT now(),locked_at timestamptz,finished_at timestamptz,
    source varchar(16),error_code varchar(64),error_message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO dota_matches(match_id) VALUES(1);
    INSERT INTO local_replay_jobs(match_id,status,archive_status,archive_key,archive_bytes) VALUES(1,'completed','active','replays/2026/09/01/1.dem.bz2',100);`);
  await db.exec(await readFile(new URL("../drizzle/0022_replay_resilience.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../drizzle/0030_replay_pipeline.sql",import.meta.url),"utf8"));
},30000);
afterAll(async()=>{await db?.close();if(folder)await rm(folder,{recursive:true,force:true});});
beforeEach(async()=>{
  vi.clearAllMocks();mocks.exists.mockResolvedValue(false);
  mocks.refresh.mockResolvedValue(null);
  mocks.metadata.mockResolvedValue({cluster:436,salt:123456789});
  mocks.download.mockImplementation(async(_descriptor,path,_checkpoint,_config,hooks)=>{
    await writeFile(path,payload,{mode:0o600});
    await hooks.checkpoint({etag:'"file"',total:payload.length,complete:true,sha256:hash});
    await hooks.progress({bytes:payload.length,total:payload.length,delta:payload.length,bps:0});
    return {path,source:"proxy",bytes:payload.length,sha256:hash};
  });
  mocks.upload.mockImplementation(async(_path,key,opts)=>{await opts?.onUploaded?.({key,bytes:payload.length});return {key,bytes:payload.length};});
  await db.exec("DELETE FROM replay_archive_jobs; DELETE FROM replay_transport_routes; DELETE FROM replay_job_events; DELETE FROM local_replay_jobs WHERE match_id<>1; DELETE FROM dota_matches WHERE match_id<>1;");
  const summary={match_id:2,cluster:189,replay_salt:100,players:[]};
  const parsed={match_id:2,version:22,players:[0,1,2,3,4,128,129,130,131,132].map(player_slot=>({player_slot,times:[0,60],
    ...Object.fromEntries(["gold_t","lh_t","dn_t","xp_t","networth_t","camps_stacked_t","hero_damage_t","hero_healing_t"].map(key=>[key,[0,1]]))}))};
  await client.query("INSERT INTO dota_matches(match_id,raw_data,local_replay_data,started_at) VALUES(2,$1,$2,now())",[JSON.stringify(summary),JSON.stringify(parsed)]);
});
const row=async()=> (await client.query("SELECT * FROM local_replay_jobs WHERE match_id=2")).rows[0];
const start=async(intent="download")=>{await worker.enqueueOne(client,2,intent);return (await worker.claim(client)).job;};
describe("replay queue SQL and persisted lifecycle",()=>{
  it("refreshes missing salt in the existing match and then downloads the replay", async()=>{
    await client.query("UPDATE dota_matches SET raw_data=$1 WHERE match_id=2", [JSON.stringify({match_id:2,cluster:436,players:[{hero_id:1}],version:22})]);
    const job=await start();
    await worker.handle(client,job,worker.hooksFor(client,job));
    const saved=(await client.query("SELECT raw_data FROM dota_matches WHERE match_id=2")).rows[0].raw_data;
    expect(saved).toMatchObject({match_id:2,cluster:436,replay_salt:123456789,version:22,players:[{hero_id:1}]});
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect((await client.query("SELECT code FROM replay_job_events WHERE match_id=2 ORDER BY created_at")).rows.map(event=>event.code))
      .toContain("metadata_direct_pending");
    expect(mocks.download.mock.calls[0][0]).toMatchObject({matchId:2,cluster:436,salt:123456789});
    expect(await row()).toMatchObject({status:"completed",archive_status:"active"});
  });
  it("uses fresh VPS metadata without calling the rate-limited relay", async()=>{
    await client.query("UPDATE dota_matches SET raw_data=$1 WHERE match_id=2", [JSON.stringify({match_id:2,cluster:436,players:[]})]);
    mocks.refresh.mockResolvedValueOnce({matchId:2,cluster:436,salt:123456789,filename:"2_123456789.dem.bz2"});
    const job=await start();
    await worker.handle(client,job,worker.hooksFor(client,job));
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect((await client.query("SELECT code FROM replay_job_events WHERE match_id=2 ORDER BY created_at")).rows.map(event=>event.code))
      .toContain("metadata_direct_ready");
    expect((await client.query("SELECT raw_data FROM dota_matches WHERE match_id=2")).rows[0].raw_data)
      .toMatchObject({cluster:436,replay_salt:123456789,replay_url:"http://replay436.valve.net/570/2_123456789.dem.bz2"});
  });
  it("completes an older cluster and salt record with a canonical URL before transfer", async()=>{
    const job=await start();
    await worker.handle(client,job,worker.hooksFor(client,job));
    const raw=(await client.query("SELECT raw_data FROM dota_matches WHERE match_id=2")).rows[0].raw_data;
    expect(raw.replay_url).toBe("http://replay189.valve.net/570/2_100.dem.bz2");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("keeps incomplete metadata pending rather than failing the match", async()=>{
    await client.query("UPDATE dota_matches SET raw_data=$1 WHERE match_id=2", [JSON.stringify({match_id:2,cluster:436,players:[]})]);
    const {ReplayError}=await import("../scripts/replay-parser/replay-transport.mjs");
    mocks.metadata.mockRejectedValueOnce(new ReplayError("replay_metadata_pending","Not ready",{retryAfter:300}));
    const job=await start();
    try { await worker.handle(client,job,worker.hooksFor(client,job));throw new Error("Expected metadata wait"); }
    catch(error){expect(error.code).toBe("replay_metadata_pending");await worker.failJob(client,job,worker.hooksFor(client,job),error);}
    expect(await row()).toMatchObject({status:"pending",phase:"retry_wait",error_code:"replay_metadata_pending"});
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("records a direct OpenDota rate limit separately from the relay failure", async()=>{
    await client.query("UPDATE dota_matches SET raw_data=$1 WHERE match_id=2", [JSON.stringify({match_id:2,players:[]})]);
    const {ReplayError}=await import("../scripts/replay-parser/replay-transport.mjs");
    mocks.refresh.mockRejectedValueOnce(new ReplayError("replay_metadata_rate_limited","Rate limited",{retryAfter:600}));
    mocks.metadata.mockRejectedValueOnce(new ReplayError("replay_metadata_rate_limited","Rate limited",{retryAfter:600}));
    const job=await start();
    await expect(worker.handle(client,job,worker.hooksFor(client,job))).rejects.toMatchObject({code:"replay_metadata_rate_limited"});
    const events=(await client.query("SELECT code,detail FROM replay_job_events WHERE match_id=2 ORDER BY created_at")).rows;
    expect(events).toContainEqual({code:"metadata_direct_failed",detail:"replay_metadata_rate_limited"});
  });
  it("migrates existing archived matches without losing their status",async()=>{
    const old=(await client.query("SELECT * FROM local_replay_jobs WHERE match_id=1")).rows[0];
    expect(old).toMatchObject({status:"completed",phase:"completed",archive_status:"active",archive_bytes:100});
  });
  it("deduplicates requests and keeps an active retry deadline when upgraded to analysis",async()=>{
    expect(await worker.enqueueOne(client,2,"download")).toBe(true);
    const first=await row();expect(await worker.enqueueOne(client,2,"download")).toBe(false);
    expect(await worker.enqueueOne(client,2,"analysis")).toBe(true);
    const next=await row();expect(next.intent).toBe("analysis");expect(next.retry_deadline_at).toEqual(first.retry_deadline_at);
  });
  it("claims only due jobs and fences all writes by the current lease",async()=>{
    const job=await start();const hooks=worker.hooksFor(client,job);
    await hooks.phase("connecting",{endpoint:"https://relay.test",address:"1.1.1.1"});
    await hooks.progress({bytes:10,total:100,delta:10,bps:20});
    expect(await row()).toMatchObject({phase:"connecting",downloaded_bytes:10,total_bytes:100,transfer_bytes:10,download_bps:20});
    expect((await worker.claim(client)).job).toBeUndefined();
    await expect(worker.updateJob(client,{...job,lease:"2000-01-01T00:00:00Z"},"download_bps=0")).rejects.toMatchObject({code:"replay_lease_lost"});
  });
  it("persists route cooldown after repeated failures and clears it on success",async()=>{
    const job=await start();const hooks=worker.hooksFor(client,job);
    const route={key:"https://relay.test|1.1.1.1",endpoint:"https://relay.test",address:"1.1.1.1"};
    for(let i=0;i<3;i++) await hooks.routeFailure(route,"replay_connect_timeout");
    const failed=(await hooks.routes())[0];
    expect(failed.failures).toBe(3);expect(new Date(failed.open_until).getTime()).toBeGreaterThan(Date.now());
    await hooks.routeSuccess(route);
    expect((await hooks.routes())[0]).toMatchObject({failures:0,open_until:null,last_error_code:null});
  });
  it("retains a complete file on upload failure and reuses it without downloading again",async()=>{
    const job=await start("analysis");const hooks=worker.hooksFor(client,job);
    mocks.upload.mockRejectedValueOnce(new Error("S3 timeout"));
    await expect(worker.handle(client,job,hooks)).rejects.toThrow("S3 timeout");
    const failed=await row();expect(failed.spool_complete).toBe(true);expect((await lstat(join(folder,failed.spool_name))).size).toBe(payload.length);
    await worker.updateJob(client,job,"status='pending',locked_at=NULL,run_after=now()");
    const next=(await worker.claim(client)).job;
    await worker.handle(client,next,worker.hooksFor(client,next));
    expect(mocks.download).toHaveBeenCalledTimes(1);expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(await row()).toMatchObject({status:"completed",phase:"completed",archive_status:"active",spool_name:null});
    await expect(lstat(join(folder,failed.spool_name))).rejects.toMatchObject({code:"ENOENT"});
  });
  it("checks a previously uploaded object before repeating an upload whose verification timed out",async()=>{
    const job=await start();
    mocks.upload.mockImplementationOnce(async(_path,key,opts)=>{await opts.onUploaded({key,bytes:payload.length});throw new Error("HEAD timeout");});
    await expect(worker.handle(client,job,worker.hooksFor(client,job))).rejects.toThrow("HEAD timeout");
    expect((await row()).archive_key).toMatch(/\/2.dem.bz2$/);
    await worker.updateJob(client,job,"status='pending',locked_at=NULL,run_after=now()");
    mocks.exists.mockResolvedValue(true);
    const next=(await worker.claim(client)).job;await worker.handle(client,next,worker.hooksFor(client,next));
    expect(mocks.upload).toHaveBeenCalledTimes(1);expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({status:"completed",archive_status:"active"});
  });
  it("does not call a temporarily unreachable archive missing or download it again",async()=>{
    const job=await start();await worker.updateJob(client,job,"archive_status='active',archive_key='replays/2026/09/01/2.dem.bz2',archive_bytes=100");
    Object.assign(job,{archive_status:"active",archive_key:"replays/2026/09/01/2.dem.bz2",archive_bytes:100});
    mocks.exists.mockRejectedValueOnce(new Error("temporary archive timeout"));
    await expect(worker.handle(client,job,worker.hooksFor(client,job))).rejects.toThrow("temporary archive timeout");
    expect(mocks.download).not.toHaveBeenCalled();expect((await row()).archive_status).toBe("active");
  });
  it("persists a bounded retry with phase, event and next-run time", async()=>{
    const job=await start();job.currentPhase="connecting";
    await worker.failJob(client,job,worker.hooksFor(client,job),new Error("network"));
    const next=await row();expect(next).toMatchObject({status:"pending",phase:"retry_wait",locked_at:null});
    expect(new Date(next.run_after).getTime()).toBeGreaterThan(Date.now());
  });
  it("keeps an in-flight download upgraded to analysis queued after download completion",async()=>{
    const job=await start();await worker.enqueueOne(client,2,"analysis");
    await worker.handle(client,job,worker.hooksFor(client,job));
    expect(await row()).toMatchObject({status:"pending",phase:"queued",intent:"analysis",archive_status:"active"});
  });
  it("recovers abandoned work and expires retry without renewing its deadline",async()=>{
    await start();await client.query("UPDATE local_replay_jobs SET heartbeat_at=now()-interval '11 minutes' WHERE match_id=2");
    const recovered=await worker.claim(client);expect(recovered.recovered).toBe(1);expect(recovered.job.match_id).toBe(2);
    await client.query("UPDATE local_replay_jobs SET status='pending',retry_deadline_at=now()-interval '1 minute' WHERE match_id=2");
    const expired=await worker.claim(client);expect(expired.expired).toBe(1);expect(expired.job).toBeUndefined();
    expect(await row()).toMatchObject({status:"failed",error_code:"replay_retry_exhausted"});
  });
});

describe("independent replay pipeline",()=>{
 it("completes foreground delivery before archiving and retains the verified checkpoint",async()=>{
  const job=await start("download");await worker.handle(client,job,worker.hooksFor(client,job),{pipeline:true});
  const saved=await row();expect(saved).toMatchObject({status:"completed",phase:"completed",spool_complete:true,archive_status:"missing",reserved_bytes:0});
  expect(await readFile(join(folder,saved.spool_name))).toEqual(payload);expect(mocks.upload).not.toHaveBeenCalled();
  expect((await client.query("SELECT status FROM replay_archive_jobs WHERE match_id=2")).rows[0].status).toBe("pending");
 });
 it("hands an unparsed prepared file to the parser lane without uploading or deleting it",async()=>{
  await client.query("UPDATE dota_matches SET local_replay_data=NULL WHERE match_id=2");
  const job=await start("analysis");await worker.handle(client,job,worker.hooksFor(client,job),{pipeline:true});
  expect(await row()).toMatchObject({status:"pending",phase:"awaiting_parse",locked_at:null,spool_complete:true});expect(mocks.upload).not.toHaveBeenCalled();
  const pipeline=await import("../scripts/replay-parser/run-pipeline.mjs");expect(await pipeline.claimLane(client,"prepare")).toBeUndefined();
  expect(await pipeline.claimLane(client,"parse")).toMatchObject({match_id:2,status:"processing",phase:"parsing",attempts:1});expect(await pipeline.claimLane(client,"parse")).toBeUndefined();
 });
 it("isolates archive failure and opens a shared circuit without changing completed analysis",async()=>{
  const job=await start("analysis");await worker.handle(client,job,worker.hooksFor(client,job),{pipeline:true});
  const pipeline=await import("../scripts/replay-parser/run-pipeline.mjs"),archive=await pipeline.claimArchive(client);expect(archive.match_id).toBe(2);
  mocks.upload.mockRejectedValueOnce(Object.assign(new Error("private detail"),{name:"TimeoutError",code:"ETIMEDOUT",archiveStage:"archive_upload_part"}));
  await pipeline.archiveCheckpoint(client,archive);expect(await row()).toMatchObject({status:"completed",phase:"completed",spool_complete:true});
  expect((await client.query("SELECT * FROM replay_archive_jobs WHERE match_id=2")).rows[0]).toMatchObject({status:"pending",error_code:"ETIMEDOUT"});
  await client.query("UPDATE replay_archive_jobs SET run_after=now() WHERE match_id=2");expect(await pipeline.claimArchive(client)).toBeUndefined();
 });
 it("interleaves owners and recovers an interrupted parse without another network download",async()=>{
  const pipeline=await import("../scripts/replay-parser/run-pipeline.mjs"),a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
  await client.query("INSERT INTO dota_matches(match_id,raw_data,started_at) SELECT n,'{}',now() FROM generate_series(3,5) n");
  await client.query("INSERT INTO local_replay_jobs(match_id,requested_by,request_started_at) VALUES(3,$1,now()-interval '3 minutes'),(4,$1,now()-interval '2 minutes'),(5,$2,now()-interval '1 minute')",[a,b]);
  const first=await pipeline.claimLane(client,"prepare"),second=await pipeline.claimLane(client,"prepare");expect([first.match_id,second.match_id]).toEqual([3,5]);
  await client.query("UPDATE local_replay_jobs SET phase='parsing',spool_complete=true,heartbeat_at=now()-interval '3 minutes' WHERE match_id=3");
  await pipeline.recoverLeases(client);expect((await client.query("SELECT * FROM local_replay_jobs WHERE match_id=3")).rows[0]).toMatchObject({status:"pending",phase:"awaiting_parse",reserved_bytes:0});
  expect((await pipeline.claimLane(client,"parse")).match_id).toBe(3);await expect(worker.updateJob(client,first,"source='proxy'")).rejects.toMatchObject({code:"replay_lease_lost"});
 });
 it("reserves space atomically and rolls back a second reservation when physical reserve is insufficient",async()=>{
  const {reserveCapacity}=await import("../scripts/replay-parser/replay-pipeline-capacity.mjs"),{MAX_REPLAY_BYTES}=await import("../scripts/replay-parser/replay-queue-utils.mjs"),{MIN_FREE}=await import("../scripts/replay-parser/replay-spool.mjs"),pipeline=await import("../scripts/replay-parser/run-pipeline.mjs");
  const first=await start("download");await client.query("INSERT INTO dota_matches(match_id,raw_data,started_at) VALUES(3,'{}',now())");await client.query("INSERT INTO local_replay_jobs(match_id) VALUES(3)");
  const second=await pipeline.claimLane(client,"prepare"),disk=async()=>({bavail:MIN_FREE+MAX_REPLAY_BYTES+10,bsize:1});
  await reserveCapacity(client,first,folder,0,disk);await expect(reserveCapacity(client,second,folder,0,disk)).rejects.toMatchObject({code:"replay_disk_capacity"});
  expect(Number((await row()).reserved_bytes)).toBe(MAX_REPLAY_BYTES);expect(Number((await client.query("SELECT reserved_bytes FROM local_replay_jobs WHERE match_id=3")).rows[0].reserved_bytes)).toBe(0);
 });
 it("serializes heartbeat/progress pg queries and continues after a rejection",async()=>{
  const {serializedClient}=await import("../scripts/replay-parser/run-pipeline.mjs");let concurrent=0,peak=0;
  const wrapped=serializedClient({query:async value=>{concurrent++;peak=Math.max(peak,concurrent);await Promise.resolve();concurrent--;if(value==="fail")throw new Error("test");return value;}});
  const result=await Promise.allSettled([wrapped.query("heartbeat"),wrapped.query("fail"),wrapped.query("progress")]);await wrapped.drain();
  expect(peak).toBe(1);expect(result.map(item=>item.status)).toEqual(["fulfilled","rejected","fulfilled"]);
 });
 it("retries HEAD verification after a confirmed upload without uploading the replay again",async()=>{
  const job=await start("analysis");await worker.handle(client,job,worker.hooksFor(client,job),{pipeline:true});const pipeline=await import("../scripts/replay-parser/run-pipeline.mjs");
  mocks.upload.mockImplementationOnce(async(_path,key,opts)=>{await opts.onUploaded({key,bytes:payload.length});throw Object.assign(new Error("HEAD timeout"),{code:"ETIMEDOUT",archiveStage:"archive_head_object"});});
  await pipeline.archiveCheckpoint(client,await pipeline.claimArchive(client));expect((await row()).archive_key).toMatch(/^replays\//);
  await client.query("DELETE FROM replay_transport_routes WHERE route_key='archive-storage'");await client.query("UPDATE replay_archive_jobs SET run_after=now() WHERE match_id=2");mocks.exists.mockResolvedValueOnce(true);
  await pipeline.archiveCheckpoint(client,await pipeline.claimArchive(client));expect(mocks.upload).toHaveBeenCalledOnce();expect(await row()).toMatchObject({status:"completed",archive_status:"active",spool_complete:true});
 });
});
