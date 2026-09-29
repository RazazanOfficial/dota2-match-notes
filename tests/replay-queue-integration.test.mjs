import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ upload:vi.fn(), exists:vi.fn(), download:vi.fn() }));
vi.mock("../scripts/replay-parser/replay-archive.mjs", async original => ({ ...await original(), uploadReplay:mocks.upload, archivedReplayExists:mocks.exists }));
vi.mock("../scripts/replay-parser/replay-transport.mjs", async original => ({ ...await original(), downloadResilient:mocks.download }));
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
  client={ query:async (query,args=[])=>{const r=await db.query(query,args);return {rows:r.rows,rowCount:r.rows.length || r.affectedRows || 0};} };
  await db.exec(`CREATE TABLE dota_matches(match_id bigint PRIMARY KEY,raw_data jsonb,local_replay_data jsonb,started_at timestamptz);
    CREATE TABLE local_replay_jobs(match_id bigint PRIMARY KEY REFERENCES dota_matches(match_id),status varchar(16) NOT NULL DEFAULT 'pending',
    intent varchar(16) NOT NULL DEFAULT 'analysis',archive_key text,archive_status varchar(16) NOT NULL DEFAULT 'missing',archive_bytes integer,
    archived_at timestamptz,attempts smallint NOT NULL DEFAULT 0,run_after timestamptz NOT NULL DEFAULT now(),locked_at timestamptz,finished_at timestamptz,
    source varchar(16),error_code varchar(64),error_message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO dota_matches(match_id) VALUES(1);
    INSERT INTO local_replay_jobs(match_id,status,archive_status,archive_key,archive_bytes) VALUES(1,'completed','active','replays/2026/09/01/1.dem.bz2',100);`);
  await db.exec(await readFile(new URL("../drizzle/0022_replay_resilience.sql",import.meta.url),"utf8"));
},30000);
afterAll(async()=>{await db?.close();if(folder)await rm(folder,{recursive:true,force:true});});
beforeEach(async()=>{
  vi.clearAllMocks();mocks.exists.mockResolvedValue(false);
  mocks.download.mockImplementation(async(_descriptor,path,_checkpoint,_config,hooks)=>{
    await writeFile(path,payload,{mode:0o600});
    await hooks.checkpoint({etag:'"file"',total:payload.length,complete:true,sha256:hash});
    await hooks.progress({bytes:payload.length,total:payload.length,delta:payload.length,bps:0});
    return {path,source:"proxy",bytes:payload.length,sha256:hash};
  });
  mocks.upload.mockImplementation(async(_path,key,opts)=>{await opts?.onUploaded?.({key,bytes:payload.length});return {key,bytes:payload.length};});
  await db.exec("DELETE FROM replay_transport_routes; DELETE FROM replay_job_events; DELETE FROM local_replay_jobs WHERE match_id<>1; DELETE FROM dota_matches WHERE match_id<>1;");
  const summary={match_id:2,cluster:189,replay_salt:100,players:[]};
  const parsed={match_id:2,players:Array(10).fill({})};
  await client.query("INSERT INTO dota_matches(match_id,raw_data,local_replay_data,started_at) VALUES(2,$1,$2,now())",[JSON.stringify(summary),JSON.stringify(parsed)]);
});
const row=async()=> (await client.query("SELECT * FROM local_replay_jobs WHERE match_id=2")).rows[0];
const start=async(intent="download")=>{await worker.enqueueOne(client,2,intent);return (await worker.claim(client)).job;};
describe("replay queue SQL and persisted lifecycle",()=>{
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
