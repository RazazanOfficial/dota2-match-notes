#!/usr/bin/env node
import "../env.mjs";
import { requireComputeNode } from "../node-role.mjs";
import pg from "pg";
import {lstat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {handle,hooksFor,updateJob,failJob,parsePrepared,incoming,abort} from "./run-queue.mjs";
import {inspectSpool,verifyCheckpoint,cleanCompletedPipelineSpool} from "./replay-spool.mjs";
import {replayDescriptor} from "./replay-queue-utils.mjs";
import {replayArchiveKey,uploadReplay,archivedReplayExists} from "./replay-archive.mjs";
import {MAX_ARCHIVE_ATTEMPTS,MAX_METADATA_ATTEMPTS,MAX_NETWORK_ATTEMPTS} from "./replay-job-policy.mjs";
const log=value=>console.log(JSON.stringify(value));
let pipelineFailure;
function stopWithFailure(error) {
  // Keep the initiating fault even if job cancellation is handled as a retry.
  // A signal has already started a graceful shutdown when there is no fault.
  if(abort.signal.aborted)return;
  pipelineFailure=error;abort.abort(error);
}
const delay=ms=>new Promise(resolve=>{
  if(abort.signal.aborted)return resolve();
  const done=()=>{clearTimeout(timer);abort.signal.removeEventListener("abort",done);resolve();};
  const timer=setTimeout(done,ms);abort.signal.addEventListener("abort",done,{once:true});
});
// Heartbeats/progress callbacks never overlap queries on a pg connection.
export function serializedClient(raw) {
  let pending=Promise.resolve();
  return {query(...args){const next=pending.then(()=>raw.query(...args));pending=next.catch(()=>{});return next;},drain:()=>pending};
}
export async function recoverLeases(client) {
  await client.query(`UPDATE local_replay_jobs SET status='pending',phase=CASE WHEN phase='parsing' AND spool_complete THEN 'awaiting_parse' ELSE 'queued' END,
    locked_at=NULL,reserved_bytes=0,run_after=now(),error_code='worker_interrupted',updated_at=now()
    WHERE status='processing' AND coalesce(heartbeat_at,locked_at)<now()-interval '2 minutes'`);
  await client.query(`UPDATE replay_archive_jobs SET status='pending',locked_at=NULL,run_after=now(),updated_at=now()
    WHERE status='processing' AND coalesce(heartbeat_at,locked_at)<now()-interval '2 minutes'`);
  await client.query(`UPDATE local_replay_jobs SET status='failed',phase='failed',
    error_code=CASE WHEN error_code IN ('replay_metadata_pending','replay_metadata_rate_limited','replay_metadata_unavailable','replay_metadata_cooldown')
      THEN 'replay_metadata_attempts_exhausted' ELSE 'replay_attempts_exhausted' END,
    error_message='Automatic checks stopped; request again later',finished_at=now(),reserved_bytes=0,updated_at=now()
    WHERE status='pending' AND phase<>'awaiting_parse' AND (
      retry_deadline_at<=now() OR request_started_at<=now()-interval '1 day' OR
      attempts>=CASE WHEN error_code IN ('replay_metadata_pending','replay_metadata_rate_limited','replay_metadata_unavailable','replay_metadata_cooldown') THEN ${MAX_METADATA_ATTEMPTS} ELSE ${MAX_NETWORK_ATTEMPTS} END)`);
  await client.query(`UPDATE replay_archive_jobs SET status='failed',error_code='replay_archive_attempts_exhausted',locked_at=NULL,updated_at=now()
    WHERE status='pending' AND attempts>=${MAX_ARCHIVE_ATTEMPTS}`);
}
export async function claimLane(client,lane) {
  const parse=lane==="parse";
  const result=await client.query(`UPDATE local_replay_jobs SET status='processing',phase=$1,phase_started_at=now(),locked_at=now(),heartbeat_at=now(),
    dispatched_at=now(),updated_at=now(),attempts=least(attempts+${parse?0:1},32767)
    WHERE match_id=(SELECT j.match_id FROM local_replay_jobs j WHERE j.status='pending' AND j.run_after<=now() ${parse?"":"AND j.retry_deadline_at>now()"}
      AND ${parse?"j.phase='awaiting_parse'":"j.phase<>'awaiting_parse'"}
      ORDER BY CASE
        WHEN j.download_requested_at>now()-interval '30 minutes' AND
          (SELECT count(*) FROM (SELECT download_requested_at FROM local_replay_jobs WHERE dispatched_at IS NOT NULL ORDER BY dispatched_at DESC LIMIT 3) recent WHERE recent.download_requested_at>now()-interval '30 minutes')<3 THEN 0
        WHEN j.request_started_at<now()-interval '10 minutes' THEN 1
        WHEN j.download_requested_at>now()-interval '30 minutes' THEN 2 ELSE 3 END,
      (SELECT max(p.dispatched_at) FROM local_replay_jobs p WHERE p.requested_by IS NOT DISTINCT FROM j.requested_by) NULLS FIRST,
      j.request_started_at,j.match_id LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *,locked_at::text AS lease`,[parse?"parsing":"checking_archive"]);
  return result.rows[0];
}
export async function claimArchive(client) {
  const result=await client.query(`UPDATE replay_archive_jobs SET status='processing',locked_at=now(),heartbeat_at=now(),attempts=attempts+1,updated_at=now()
    WHERE match_id=(SELECT a.match_id FROM replay_archive_jobs a JOIN local_replay_jobs j USING(match_id)
      WHERE a.status='pending' AND a.run_after<=now() AND j.spool_complete AND j.spool_name IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM replay_transport_routes WHERE route_key='archive-storage' AND open_until>now())
      ORDER BY CASE
        WHEN j.download_requested_at>now()-interval '30 minutes' AND
          (SELECT count(*) FROM (SELECT x.download_requested_at FROM replay_archive_jobs y JOIN local_replay_jobs x USING(match_id) WHERE y.status IN ('processing','completed') ORDER BY y.updated_at DESC LIMIT 3) recent WHERE recent.download_requested_at>now()-interval '30 minutes')<3 THEN 0
        WHEN a.run_after<now()-interval '10 minutes' THEN 1
        WHEN j.download_requested_at>now()-interval '30 minutes' THEN 2 ELSE 3 END,a.run_after,a.match_id LIMIT 1 FOR UPDATE OF a SKIP LOCKED) RETURNING *,locked_at::text AS lease`);
  return result.rows[0];
}
export async function archiveCheckpoint(client,task) {
  const update=async(set,values=[])=>{
    const result=await client.query(`UPDATE replay_archive_jobs SET ${set},updated_at=now() WHERE match_id=$1 AND status='processing' AND locked_at=$2::timestamptz RETURNING match_id`,[task.match_id,task.lease,...values]);
    if(result.rowCount!==1)throw new Error("archive_lease_lost");
  };
  let busy=false,finished=false;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{await update("heartbeat_at=now()");}catch(error){if(!finished)stopWithFailure(error);}finally{busy=false;}},10000);
  try {
    const row=(await client.query("SELECT j.*,m.raw_data,m.started_at FROM local_replay_jobs j JOIN dota_matches m USING(match_id) WHERE j.match_id=$1",[task.match_id])).rows[0];
    const file=row?.spool_name?await inspectSpool(incoming,row.spool_name):null;
    if(!row?.spool_complete||!await verifyCheckpoint(file,row.spool_sha256,row.total_bytes))throw new Error("archive_checkpoint_invalid");
    const descriptor=replayDescriptor(row.raw_data,Number(row.match_id));
    const key=descriptor?replayArchiveKey(row.started_at,descriptor):row.archive_key;
    if(!key)throw new Error("archive_key_invalid");
    await client.query("UPDATE local_replay_jobs SET upload_bytes=0 WHERE match_id=$1",[task.match_id]);
    let exists=false;
    if(row.archive_key===key&&row.archive_bytes===file.bytes) {
      try{exists=await archivedReplayExists(key,file.bytes,row.spool_sha256);}catch(error){error.archiveStage="archive_head_object";throw error;}
    }
    const result=exists?{key,bytes:file.bytes}:await uploadReplay(file.path,key,{
      signal:abort.signal,
      onUploaded:result=>client.query("UPDATE local_replay_jobs SET archive_key=$2,archive_bytes=$3 WHERE match_id=$1 AND spool_name=$4 AND spool_sha256=$5",[task.match_id,result.key,result.bytes,row.spool_name,row.spool_sha256]),
      onProgress:bytes=>client.query("UPDATE local_replay_jobs SET upload_bytes=upload_bytes+$2 WHERE match_id=$1",[task.match_id,bytes]),
      onStage:async stage=>{await client.query("INSERT INTO replay_job_events(match_id,phase,code,detail) VALUES($1,'archive',$2,'Independent archive transport')",[task.match_id,stage]);log({code:stage,matchId:Number(task.match_id),lane:"archive"});},
    });
    await client.query("UPDATE local_replay_jobs SET archive_key=$2,archive_bytes=$3,archive_status='active',archived_at=now(),updated_at=now() WHERE match_id=$1 AND spool_name=$4 AND spool_sha256=$5",[task.match_id,result.key,result.bytes,row.spool_name,row.spool_sha256]);
    finished=true;await update("status='completed',locked_at=NULL,error_code=NULL");
    await client.query("DELETE FROM replay_transport_routes WHERE route_key='archive-storage'");log({code:"archive_complete",matchId:Number(task.match_id)});
  }catch(error){
    const token=value=>typeof value==="string"&&/^[A-Za-z0-9_.-]{1,64}$/.test(value)?value:"archive_transport_failed";
    const exhausted=Number(task.attempts)>=MAX_ARCHIVE_ATTEMPTS;
    const code=exhausted?"replay_archive_attempts_exhausted":token(error.code||error.name),terminal=exhausted||["archive_checkpoint_invalid","archive_key_invalid"].includes(error.message);
    finished=true;await update("status=$3,locked_at=NULL,error_code=$4,run_after=now()+interval '10 minutes'",[terminal?"failed":"pending",code]);
    if(!terminal)await client.query(`INSERT INTO replay_transport_routes(route_key,endpoint,address,failures,open_until,last_error_code)
      VALUES('archive-storage','archive','storage',1,now()+interval '10 minutes',$1) ON CONFLICT(route_key) DO UPDATE SET
      failures=replay_transport_routes.failures+1,open_until=now()+interval '10 minutes',last_error_code=$1,updated_at=now()`,[code]);
    log({code:terminal?"archive_stopped":"archive_retry_scheduled",matchId:Number(task.match_id),transportCode:code,stage:token(error.archiveStage),httpStatus:error.$metadata?.httpStatusCode,retrySeconds:600});
  }finally{clearInterval(timer);}
}
async function foreground(client,lane) {
  const job=await claimLane(client,lane);if(!job)return false;
  const hooks=hooksFor(client,job);let busy=false,finished=false;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{await updateJob(client,job,"download_bps=download_bps");}catch(error){if(!finished)stopWithFailure(error);}finally{busy=false;}},10000);
  try{if(lane==="parse")await parsePrepared(client,job,hooks);else await handle(client,job,hooks,{pipeline:true});finished=true;}
  catch(error){finished=true;await failJob(client,job,hooks,error);}finally{clearInterval(timer);}
  return true;
}
export function pipelineLanes(env = process.env) {
  const count = (key, fallback, max) => {
    const raw = env[key]?.trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  return [
    ...Array(count("LOCAL_REPLAY_PREPARE_CONCURRENCY", 2, 4)).fill("prepare"),
    ...Array(count("LOCAL_REPLAY_PARSE_CONCURRENCY", 1, 2)).fill("parse"),
    ...Array(count("LOCAL_REPLAY_ARCHIVE_CONCURRENCY", 1, 2)).fill("archive"),
  ];
}
export async function main() {
  requireComputeNode();
  if(process.env.LOCAL_REPLAY_WORKER_ENABLED!=="true"){log({enabled:false});return;}
  const lanes=pipelineLanes();
  const directory=await lstat(incoming);
  if(!directory.isDirectory()||directory.isSymbolicLink()||directory.mode&0o077||directory.uid!==process.getuid())throw new Error("Replay staging must be private and owned by worker");
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:lanes.length+2,connectionTimeoutMillis:5000,statement_timeout:10000});
  const owner=await pool.connect();let locked=false;
  try{
    locked=(await owner.query("SELECT pg_try_advisory_lock(73341017) AS locked")).rows[0].locked;
    if(!locked)throw new Error("Another replay worker is active");
    owner.on("error",stopWithFailure);await recoverLeases(owner);await cleanCompletedPipelineSpool(owner,incoming);log({enabled:true,prepare:lanes.filter(x=>x==="prepare").length,parse:lanes.filter(x=>x==="parse").length,archive:lanes.filter(x=>x==="archive").length,cleanup:true});
    let lastRecovery=Date.now();
    async function loop(lane){
      const raw=await pool.connect(),client=serializedClient(raw),disconnected=stopWithFailure;raw.on("error",disconnected);
      try{while(!abort.signal.aborted){
        if(lane==="prepare"&&Date.now()-lastRecovery>60000){lastRecovery=Date.now();await recoverLeases(client);await cleanCompletedPipelineSpool(client,incoming);}
        const task=lane==="archive"?await claimArchive(client):null;
        const worked=lane==="archive"?task&&(await archiveCheckpoint(client,task),true):await foreground(client,lane);
        if(!worked)await delay(1500);
      }}finally{await client.drain();raw.removeListener("error",disconnected);raw.release();}
    }
    await Promise.all(lanes.map(lane=>loop(lane).catch(error=>{pipelineFailure ||= error;abort.abort(error);})));
    if(pipelineFailure)throw pipelineFailure;
  }finally{abort.abort();if(locked)await owner.query("SELECT pg_advisory_unlock(73341017)").catch(()=>{});owner.release();await pool.end();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(error=>{log({code:"replay_pipeline_failed",name:error.name,transportCode:/^[A-Za-z0-9_.-]{1,80}$/.test(error.code || "")?error.code:undefined});process.exitCode=1;});
