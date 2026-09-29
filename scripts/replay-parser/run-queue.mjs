#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { archivedReplayExists, replayArchiveKey, retrieveReplay, uploadReplay } from "./replay-archive.mjs";
import { replayDescriptor } from "./replay-queue-utils.mjs";
import { downloadResilient, ReplayError, sha256File, transportConfig } from "./replay-transport.mjs";
import { cleanSpool, ensureCapacity, inspectSpool, spoolPath, verifyCheckpoint } from "./replay-spool.mjs";
import { processingPlan, retryDecision } from "./replay-job-policy.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const incoming = process.env.LOCAL_REPLAY_INCOMING_DIR || "/var/lib/dota2notes/replays/incoming";
const WORKER_LOCK = 73341017;
const abort = new AbortController();
process.once("SIGTERM", () => abort.abort());
process.once("SIGINT", () => abort.abort());
const log = result => process.stdout.write(`${JSON.stringify(result)}\n`);
// Error messages from third-party libraries can include URLs or request options.
const safeError = error => error instanceof ReplayError ? error.message.slice(0, 300) : "Replay stage failed; consult the phase and error code";

async function enqueueOne(client, matchId, intent) {
  const result = await client.query(`INSERT INTO local_replay_jobs (match_id, intent)
    SELECT match_id, $2 FROM dota_matches WHERE match_id=$1 AND raw_data IS NOT NULL
    ON CONFLICT (match_id) DO UPDATE SET
      intent=CASE WHEN local_replay_jobs.status IN ('pending','processing') AND local_replay_jobs.intent='analysis' THEN 'analysis' ELSE EXCLUDED.intent END,
      status=CASE WHEN local_replay_jobs.status='processing' THEN 'processing' ELSE 'pending' END,
      phase=CASE WHEN local_replay_jobs.status='processing' THEN local_replay_jobs.phase ELSE 'queued' END,
      attempts=CASE WHEN local_replay_jobs.status IN ('pending','processing') THEN local_replay_jobs.attempts ELSE 0 END,
      request_started_at=CASE WHEN local_replay_jobs.status IN ('pending','processing') THEN local_replay_jobs.request_started_at ELSE now() END,
      retry_deadline_at=CASE WHEN local_replay_jobs.status IN ('pending','processing') THEN local_replay_jobs.retry_deadline_at ELSE now()+interval '24 hours' END,
      run_after=CASE WHEN local_replay_jobs.status IN ('pending','processing') THEN local_replay_jobs.run_after ELSE now() END,
      finished_at=NULL, error_code=NULL, error_message=NULL, updated_at=now()
    WHERE local_replay_jobs.status IN ('failed','waiting_file') OR
      (local_replay_jobs.status IN ('pending','processing') AND local_replay_jobs.intent='download' AND $2='analysis') OR
      (local_replay_jobs.status='completed' AND (local_replay_jobs.archive_status<>'active' OR local_replay_jobs.archive_key IS NULL OR
        ($2='analysis' AND EXISTS(SELECT 1 FROM dota_matches WHERE match_id=$1 AND local_replay_data IS NULL)))) RETURNING match_id`, [matchId, intent]);
  return result.rowCount === 1;
}
async function updateJob(client, job, assignments, values = []) {
  const result = await client.query(`UPDATE local_replay_jobs SET ${assignments}, heartbeat_at=now(), updated_at=now()
    WHERE match_id=$1 AND status='processing' AND locked_at=$2::timestamptz RETURNING match_id`, [job.match_id, job.lease, ...values]);
  if (result.rowCount !== 1) throw new ReplayError("replay_lease_lost", "Replay worker lease was lost", { retryable: false });
}
function hooksFor(client, job) {
  return {
    routes: async () => (await client.query("SELECT * FROM replay_transport_routes")).rows,
    phase: async (phase, route = {}) => {
      job.currentPhase = phase;
      await updateJob(client, job, `phase=$3::varchar(24), phase_started_at=CASE WHEN phase=$3::varchar(24) THEN phase_started_at ELSE now() END,
        last_endpoint=coalesce($4,last_endpoint), last_address=coalesce($5,last_address)`, [phase, route.endpoint || null, route.address || null]);
    },
    event: async (phase, code, detail, route = {}) => {
      await client.query(`INSERT INTO replay_job_events(match_id,phase,code,detail,endpoint,address,http_status,transferred_bytes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [job.match_id, phase, code, detail.slice(0, 500), route.endpoint || null, route.address || null, route.httpStatus || null, route.bytes || 0]);
      log({ matchId: Number(job.match_id), phase, code, detail, endpoint: route.endpoint, address: route.address, httpStatus: route.httpStatus });
    },
    checkpoint: async ({ etag, total, complete, sha256 = null }) => {
      await updateJob(client, job, "spool_etag=$3,total_bytes=$4,spool_complete=$5,spool_sha256=$6", [etag, total, complete, sha256]);
      Object.assign(job, { spool_etag: etag, total_bytes: total, spool_complete: complete, spool_sha256: sha256 });
    },
    progress: async ({ bytes, total, delta, bps }) => updateJob(client, job,
      "downloaded_bytes=$3,total_bytes=$4,transfer_bytes=transfer_bytes+$5,download_bps=$6", [bytes, total, delta, Math.min(2147483647, Math.max(0, bps))]),
    routeSuccess: async route => client.query(`INSERT INTO replay_transport_routes(route_key,endpoint,address,last_success_at)
      VALUES($1,$2,$3,now()) ON CONFLICT(route_key) DO UPDATE SET failures=0,open_until=NULL,last_success_at=now(),last_error_code=NULL,updated_at=now()`, [route.key, route.endpoint, route.address]),
    routeFailure: async (route, code) => client.query(`INSERT INTO replay_transport_routes(route_key,endpoint,address,failures,last_error_code)
      VALUES($1,$2,$3,1,$4) ON CONFLICT(route_key) DO UPDATE SET
      failures=CASE WHEN replay_transport_routes.updated_at < now()-interval '5 minutes' THEN 1 ELSE least(100,replay_transport_routes.failures+1) END,
      open_until=CASE WHEN replay_transport_routes.updated_at >= now()-interval '5 minutes' AND replay_transport_routes.failures>=2
        THEN now()+least(600,120*(replay_transport_routes.failures-1))*interval '1 second' ELSE NULL END,
      last_error_code=$4,updated_at=now()`, [route.key, route.endpoint, route.address, code]),
  };
}
async function claim(client) {
  const recovered = await client.query(`UPDATE local_replay_jobs SET status='pending',phase='retry_wait',locked_at=NULL,
    run_after=now(),error_code='worker_interrupted',error_message='Worker stopped; recovering checkpoint',updated_at=now()
    WHERE status='processing' AND coalesce(heartbeat_at,locked_at)<now()-interval '10 minutes' RETURNING match_id`);
  const expired = await client.query(`UPDATE local_replay_jobs SET status='failed',phase='failed',error_code='replay_retry_exhausted',
    error_message='Automatic retry window ended; request again',finished_at=now(),updated_at=now()
    WHERE status='pending' AND retry_deadline_at<=now() RETURNING match_id`);
  const result = await client.query(`UPDATE local_replay_jobs SET status='processing',phase='checking_archive',phase_started_at=now(),
    locked_at=now(),heartbeat_at=now(),updated_at=now(),attempts=least(attempts+1,32767)
    WHERE match_id=(SELECT match_id FROM local_replay_jobs WHERE status='pending' AND run_after<=now()
      ORDER BY spool_complete DESC, (spool_name IS NOT NULL) DESC, run_after, match_id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *,locked_at::text AS lease`);
  return { job: result.rows[0], recovered: recovered.rowCount, expired: expired.rowCount };
}
async function importReplay(job, path) {
  if (!process.env.REPLAY_PARSER_JAR) throw new ReplayError("parser_not_configured", "REPLAY_PARSER_JAR is required", { retryable: false });
  const child = spawn(process.execPath, [join(scriptDir, "import-replay.mjs"), "--match", String(job.match_id), "--file", path],
    { cwd: join(scriptDir, "../.."), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errorOutput = "";
  child.stdout.on("data", chunk => { output = (output + chunk.toString()).slice(-2000); });
  child.stderr.on("data", chunk => { errorOutput = (errorOutput + chunk.toString()).slice(-2000); });
  const stop = () => child.kill("SIGKILL");
  abort.signal.addEventListener("abort", stop, { once: true });
  const timeout = setTimeout(stop, 330_000);
  try {
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (code !== 0) throw new ReplayError("replay_parser_failed", "Parser failed or exceeded its time budget", { retryable: false });
    const result = JSON.parse(output.trim());
    if (result.matchId !== Number(job.match_id) || result.mode !== "stored" || result.players !== 10) throw new ReplayError("replay_parser_invalid", "Parser did not confirm ten players", { retryable: false });
    if (errorOutput.includes("Lane events unavailable")) log({ matchId: Number(job.match_id), phase: "parsing", code: "lane_events_unavailable" });
  } finally { clearTimeout(timeout); abort.signal.removeEventListener("abort", stop); }
}
async function removeCheckpoint(client, job) {
  if (job.spool_name) await rm(spoolPath(incoming, job.spool_name), { force: true });
  await updateJob(client, job, "spool_name=NULL,spool_created_at=NULL,spool_complete=false,spool_etag=NULL,spool_sha256=NULL");
}
async function complete(client, job, hooks, source) {
  await hooks.event("completed", "job_complete", `Intent ${job.intent}; source ${source}`);
  await removeCheckpoint(client, job);
  // An analysis request can upgrade a download job while it is running.
  await updateJob(client, job, `status=CASE WHEN $3='download' AND intent='analysis' THEN 'pending' ELSE 'completed' END,
    phase=CASE WHEN $3='download' AND intent='analysis' THEN 'queued' ELSE 'completed' END,
    finished_at=CASE WHEN $3='download' AND intent='analysis' THEN NULL ELSE now() END,
    run_after=now(),source=$4,error_code=NULL,error_message=NULL,locked_at=NULL,download_bps=0`, [job.intent, source]);
}
async function handle(client, job, hooks) {
  job.currentPhase = "checking_archive";
  const match = (await client.query("SELECT raw_data,local_replay_data,started_at FROM dota_matches WHERE match_id=$1", [job.match_id])).rows[0];
  if (!match?.raw_data) throw new ReplayError("match_missing", "Match summary is missing", { retryable: false });
  const parsed = match.local_replay_data?.match_id === Number(job.match_id) && match.local_replay_data?.players?.length === 10;
  let archived = false;
  if (job.archive_key && job.archive_status !== "deleted") {
    archived = await archivedReplayExists(job.archive_key, job.archive_bytes); // only 404 means missing
    if (!archived) await updateJob(client, job, "archive_status='missing'");
    else if (job.archive_status !== "active") await updateJob(client, job, "archive_status='active',archived_at=now()");
  }
  let file = job.spool_name ? await inspectSpool(incoming, job.spool_name) : null;
  let validCheckpoint = job.spool_complete && await verifyCheckpoint(file, job.spool_sha256, job.total_bytes);
  if (file && job.spool_complete && !validCheckpoint) {
    await rm(file.path, { force: true }); file = null;
    await hooks.checkpoint({ etag: null, total: null, complete: false });
    await hooks.event("validating", "checkpoint_discarded", "Saved replay checksum did not match");
  }
  const plan = processingPlan({ archived, parsed, intent: job.intent, checkpoint: validCheckpoint });
  if (plan === "complete") { await complete(client, job, hooks, "existing"); return; }
  const descriptor = replayDescriptor(match.raw_data, Number(job.match_id));
  if (!descriptor && !archived && !validCheckpoint) throw new ReplayError("invalid_replay_metadata", "No valid Valve replay cluster/salt", { retryable: false });
  if (!job.spool_name) {
    job.spool_name = `.replay-${randomUUID()}.part`;
    await updateJob(client, job, "spool_name=$3,spool_created_at=now(),spool_complete=false,spool_etag=NULL,spool_sha256=NULL", [job.spool_name]);
  }
  const path = spoolPath(incoming, job.spool_name);
  let source = job.source || "proxy";
  if (!validCheckpoint) {
    await ensureCapacity(incoming, file?.bytes || 0);
    if (plan === "restore-archive") {
      await hooks.phase("restoring_archive");
      const restored = await retrieveReplay(job.archive_key, job.archive_bytes, incoming);
      await rename(restored, path);
      const hash = await sha256File(path);
      await hooks.checkpoint({ etag: null, total: job.archive_bytes, complete: true, sha256: hash });
      await hooks.progress({ bytes: job.archive_bytes, total: job.archive_bytes, delta: job.archive_bytes, bps: 0 });
      source = "archive";
    } else {
      const result = await downloadResilient(descriptor, path, { etag: job.spool_etag, total: Number(job.total_bytes) || null }, transportConfig(), hooks,
        { requestOptions: { signal: abort.signal } });
      source = result.source;
    }
    await updateJob(client, job, "source=$3", [source]);
  } else await hooks.event("validating", "checkpoint_reused", "Complete replay reused; skipping download");
  if (job.intent === "analysis" && !parsed) {
    await hooks.phase("parsing");
    await hooks.event("parsing", "parse_started", "Parsing replay");
    await importReplay(job, path);
    await hooks.event("parsing", "parse_complete", "Ten players stored");
  }
  if (!archived) {
    await hooks.phase("uploading");
    await hooks.event("uploading", "upload_started", "Uploading verified replay to archive");
    const key = descriptor ? replayArchiveKey(match.started_at, descriptor) : job.archive_key;
    if (!key) throw new ReplayError("archive_key_invalid", "Archive key could not be built", { retryable: false });
    const result = await uploadReplay(path, key, { signal: abort.signal,
      onUploaded: result => updateJob(client, job, "archive_key=$3,archive_bytes=$4", [result.key, result.bytes]),
      onProgress: delta => updateJob(client, job, "upload_bytes=upload_bytes+$3", [delta]) });
    await updateJob(client, job, "archive_key=$3,archive_bytes=$4,archive_status='active',archived_at=now()", [result.key, result.bytes]);
  }
  await complete(client, job, hooks, source);
}
async function failJob(client, job, hooks, error) {
      const fault = error instanceof ReplayError ? error : new ReplayError(
        job.currentPhase === "uploading" ? "replay_archive_upload_failed" : job.currentPhase === "checking_archive" ? "replay_archive_check_failed" : "replay_processing_failed", safeError(error));
      const decision = retryDecision(fault, job);
      await hooks.event(job.currentPhase || "queued", decision.code, safeError(fault));
      await updateJob(client, job, `status=$3::varchar(16),phase=$4::varchar(24),error_code=$5,error_message=$6,run_after=now()+$7*interval '1 second',
        locked_at=NULL,download_bps=0,finished_at=CASE WHEN $3::varchar(16)='failed' THEN now() ELSE NULL END`,
        [decision.status, decision.status === "failed" ? "failed" : "retry_wait", decision.code, safeError(fault), decision.delay]);
      log({ enabled: true, processed: 1, result: { matchId: Number(job.match_id), status: decision.status, code: decision.code, retryIn: decision.delay } });
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length && !((args.length === 2 || args.length === 3 && args[2] === "--download-only") && args[0] === "--enqueue" &&
    /^[1-9]\d{0,15}$/.test(args[1]) && Number.isSafeInteger(Number(args[1])))) throw new Error("Usage: run-queue.mjs [--enqueue MATCH_ID [--download-only]]");
  if (!args.length && process.env.LOCAL_REPLAY_WORKER_ENABLED !== "true") { log({ enabled: false }); return; }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const directory = await lstat(incoming);
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.mode & 0o077 || directory.uid !== process.getuid()) throw new Error("Replay staging directory must be private and owned by the worker");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const client = await pool.connect();
  let locked = false;
  try {
    if (args.length) { log({ matchId: Number(args[1]), queued: await enqueueOne(client, Number(args[1]), args[2] === "--download-only" ? "download" : "analysis") }); return; }
    locked = (await client.query("SELECT pg_try_advisory_lock($1) AS locked", [WORKER_LOCK])).rows[0].locked;
    if (!locked) { log({ enabled: true, processed: 0, busy: true }); return; }
    await cleanSpool(client, incoming);
    const { job, recovered, expired } = await claim(client);
    if (!job) { log({ enabled: true, recovered, expired, processed: 0 }); return; }
    const hooks = hooksFor(client, job);
    let heartbeatBusy = false;
    const heartbeat = setInterval(async () => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      try { await updateJob(client, job, "download_bps=download_bps"); } catch { abort.abort(); }
      finally { heartbeatBusy = false; }
    }, 10_000);
    try {
      await handle(client, job, hooks);
      const final = (await client.query("SELECT status,intent,archive_status FROM local_replay_jobs WHERE match_id=$1", [job.match_id])).rows[0];
      log({ enabled: true, processed: 1, result: { matchId: Number(job.match_id), status: final.status, intent: final.intent, archived: final.archive_status === "active" } });
    } catch (error) {
      await failJob(client, job, hooks, error);
    } finally { clearInterval(heartbeat); }
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK]);
    client.release(); await pool.end();
  }
}
export { enqueueOne, claim, hooksFor, complete, handle, updateJob, failJob };
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(JSON.stringify({ code: "replay_worker_failed", message: safeError(error) })); process.exitCode = 1; });
}
