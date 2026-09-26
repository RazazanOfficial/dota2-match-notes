#!/usr/bin/env node
// One bounded replay per invocation. Run as the dota2notes user in a dedicated
// systemd oneshot service, never inside a public Next.js request.
import { spawn } from "node:child_process";
import { lstat, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { archivedReplayExists, replayArchiveKey, retrieveReplay, uploadReplay } from "./replay-archive.mjs";
import { cleanupStaleDownloads, downloadReplay, replayDescriptor, replayProxySettings, retryDelaySeconds } from "./replay-queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const incoming = process.env.LOCAL_REPLAY_INCOMING_DIR || "/var/lib/dota2notes/replays/incoming";
const MAX_ATTEMPTS = 4;

function message(error) { return (error instanceof Error ? error.message : String(error)).slice(0, 500); }
function log(result) { process.stdout.write(`${JSON.stringify(result)}\n`); }

async function enqueueOne(client, matchId, intent) {
  const result = await client.query(`
    INSERT INTO local_replay_jobs (match_id, intent)
    SELECT match_id, $2 FROM dota_matches WHERE match_id = $1 AND raw_data IS NOT NULL
    ON CONFLICT (match_id) DO UPDATE SET
      intent = CASE WHEN local_replay_jobs.status IN ('pending','processing')
        AND local_replay_jobs.intent = 'analysis' THEN 'analysis' ELSE EXCLUDED.intent END,
      status = CASE WHEN local_replay_jobs.status = 'processing' THEN 'processing' ELSE 'pending' END,
      attempts = CASE WHEN local_replay_jobs.status = 'processing' THEN local_replay_jobs.attempts ELSE 0 END,
      run_after = now(),
      locked_at = CASE WHEN local_replay_jobs.status = 'processing' THEN local_replay_jobs.locked_at ELSE NULL END,
      finished_at = NULL,
      source = NULL, error_code = NULL, error_message = NULL, updated_at = now()
    WHERE local_replay_jobs.status IN ('failed', 'waiting_file') OR
      (local_replay_jobs.status = 'processing' AND local_replay_jobs.intent = 'download' AND $2 = 'analysis') OR
      (local_replay_jobs.status = 'completed' AND
       (local_replay_jobs.archive_status <> 'active' OR local_replay_jobs.archive_key IS NULL OR
        ($2 = 'analysis' AND EXISTS (SELECT 1 FROM dota_matches dm
          WHERE dm.match_id = $1 AND dm.local_replay_data IS NULL))))
    RETURNING match_id
  `, [matchId, intent]);
  return result.rowCount === 1;
}

async function recoverStale(client) {
  const result = await client.query(`
    UPDATE local_replay_jobs SET
      status = CASE WHEN attempts >= $1 THEN 'failed' ELSE 'pending' END,
      run_after = now(), locked_at = NULL, updated_at = now(),
      error_code = 'stale_worker', error_message = 'Replay worker lease expired',
      finished_at = CASE WHEN attempts >= $1 THEN now() ELSE NULL END
    WHERE status = 'processing' AND locked_at < now() - interval '40 minutes'
  `, [MAX_ATTEMPTS]);
  return result.rowCount;
}

async function claim(client) {
  await client.query("BEGIN");
  try {
    const result = await client.query(`
      SELECT match_id, status, attempts, source, intent, archive_key, archive_bytes, archive_status FROM local_replay_jobs
      WHERE status = 'pending' AND run_after <= now()
      ORDER BY run_after, match_id
      LIMIT 1 FOR UPDATE SKIP LOCKED
    `);
    const candidate = result.rows[0];
    if (!candidate) { await client.query("COMMIT"); return null; }
    const updated = await client.query(`
      UPDATE local_replay_jobs SET status = 'processing', locked_at = now(), updated_at = now(),
        attempts = attempts + 1
      WHERE match_id = $1 RETURNING locked_at::text AS locked_at, attempts
    `, [candidate.match_id]);
    await client.query("COMMIT");
    return {
      matchId: Number(candidate.match_id),
      intent: candidate.intent,
      archiveKey: candidate.archive_key,
      archiveBytes: candidate.archive_bytes,
      archiveStatus: candidate.archive_status,
      source: candidate.source,
      attempts: updated.rows[0].attempts,
      lockedAt: updated.rows[0].locked_at,
    };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function transition(client, job, status, errorCode = null, errorMessage = null, source = null, delaySeconds = 0) {
  const result = await client.query(`
    UPDATE local_replay_jobs SET status = CASE
      WHEN $3::varchar(16) = 'completed' AND $8::varchar(16) = 'download' AND intent = 'analysis' THEN 'pending'
      ELSE $3::varchar(16) END,
      error_code = $4, error_message = $5,
      source = COALESCE($6::varchar, source), run_after = now() + $7::integer * interval '1 second',
      locked_at = NULL, updated_at = now(),
      finished_at = CASE WHEN $3::varchar(16) IN ('completed','failed') AND
        NOT ($3::varchar(16) = 'completed' AND $8::varchar(16) = 'download' AND intent = 'analysis')
        THEN now() ELSE NULL END
    WHERE match_id = $1 AND status = 'processing' AND locked_at = $2::timestamptz RETURNING match_id
  `, [job.matchId, job.lockedAt, status, errorCode, errorMessage, source, delaySeconds, job.intent]);
  if (result.rowCount !== 1) throw new Error("Replay job lease was lost");
}

async function importReplay(matchId, path) {
  if (!process.env.REPLAY_PARSER_JAR) throw new Error("REPLAY_PARSER_JAR is required for analysis");
  const child = spawn(process.execPath, [join(scriptDir, "import-replay.mjs"), "--match", String(matchId), "--file", path],
    { cwd: join(scriptDir, "../.."), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "", timedOut = false;
  child.stdout.on("data", (part) => { output = (output + part.toString()).slice(-1_000); });
  child.stderr.on("data", (part) => { errors = (errors + part.toString()).slice(-1_000); });
  const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 330_000);
  try {
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (timedOut || code !== 0) throw new Error(`Replay import ${timedOut ? "timed out" : `exited ${code}`}: ${errors}`);
    const result = JSON.parse(output.trim());
    if (result.matchId !== matchId || result.mode !== "stored" || result.players !== 10) throw new Error("Replay import did not confirm all ten players");
  } finally { clearTimeout(timeout); }
}

async function handle(client, job, proxy) {
  const result = await client.query("SELECT raw_data, local_replay_data, started_at FROM dota_matches WHERE match_id = $1", [job.matchId]);
  const match = result.rows[0];
  if (!match?.raw_data) {
    await transition(client, job, "failed", "match_missing", "Match summary is missing");
    return { matchId: job.matchId, status: "failed", code: "match_missing" };
  }
  const parsed = match.local_replay_data?.match_id === job.matchId && match.local_replay_data?.players?.length === 10;
  const archived = job.archiveKey && job.archiveStatus === "active" ? await archivedReplayExists(job.archiveKey, job.archiveBytes) : false;
  if (job.archiveKey && !archived && job.archiveStatus !== "deleted") {
    await client.query("UPDATE local_replay_jobs SET archive_status = 'missing', updated_at = now() WHERE match_id = $1 AND locked_at = $2::timestamptz", [job.matchId, job.lockedAt]);
  }
  if (archived && (job.intent === "download" || parsed)) {
    await transition(client, job, "completed", null, null, "existing");
    return { matchId: job.matchId, status: "completed", source: "existing", archived: true };
  }
  const descriptor = replayDescriptor(match.raw_data, job.matchId);
  if (!descriptor) {
    await transition(client, job, "failed", "invalid_replay_metadata", "No valid Valve replay cluster/salt for this match");
    return { matchId: job.matchId, status: "failed", code: "invalid_replay_metadata" };
  }
  let file = null;
  let temporary = false;
  let downloadSource = null;
  if (!file && archived) {
    file = await retrieveReplay(job.archiveKey, job.archiveBytes, incoming);
    temporary = true;
    downloadSource = "archive";
  }
  if (!file) {
    try {
      const result = await downloadReplay(descriptor, incoming, fetch, proxy);
      file = result.path;
      temporary = result.downloaded;
      downloadSource = result.source;
    } catch (error) {
      if (error?.code === "replay_proxy_auth_failed") {
        await transition(client, job, "failed", error.code, message(error));
        return { matchId: job.matchId, status: "failed", code: error.code };
      }
      if (["replay_proxy_unavailable", "replay_not_ready"].includes(error?.code) &&
        match.started_at && Date.now() - new Date(match.started_at).getTime() < 14 * 86400_000) {
        await transition(client, job, "pending", error.code, message(error), null, retryDelaySeconds(job.attempts));
        return { matchId: job.matchId, status: "pending", code: error.code };
      }
      if (error?.code === "valve_access_blocked" || job.attempts >= MAX_ATTEMPTS) {
        await transition(client, job, "failed", error?.code || "download_failed", message(error), proxy ? "proxy" : "valve");
        return { matchId: job.matchId, status: "failed", code: error?.code || "download_failed" };
      }
      throw error;
    }
  }
  try {
    if (job.intent === "analysis" && !parsed) await importReplay(job.matchId, file);
    if (!archived) {
      const key = replayArchiveKey(match.started_at, descriptor);
      const archived = await uploadReplay(file, key);
      const updated = await client.query(`
        UPDATE local_replay_jobs SET archive_key = $3, archive_bytes = $4, archive_status = 'active', archived_at = now(), updated_at = now()
        WHERE match_id = $1 AND status = 'processing' AND locked_at = $2::timestamptz
        RETURNING match_id
      `, [job.matchId, job.lockedAt, archived.key, archived.bytes]);
      if (updated.rowCount !== 1) throw new Error("Replay job lease was lost after archive upload");
    }
    await transition(client, job, "completed", null, null, downloadSource);
    return { matchId: job.matchId, status: "completed", intent: job.intent, archived: true, source: downloadSource };
  } finally {
    // Every replay file here is temporary; preserve archived copies in S3.
    if (temporary) await rm(file, { force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !((args.length === 2 || args.length === 3 && args[2] === "--download-only") && args[0] === "--enqueue" &&
    /^\d{1,16}$/.test(args[1]) && Number.isSafeInteger(Number(args[1])) && Number(args[1]) > 0)) {
    throw new Error("Usage: node scripts/replay-parser/run-queue.mjs [--enqueue MATCH_ID [--download-only]]");
  }
  if (!args.length && process.env.LOCAL_REPLAY_WORKER_ENABLED !== "true") {
    log({ enabled: false }); return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const proxy = replayProxySettings();
  const details = await lstat(incoming);
  if (!details.isDirectory() || details.isSymbolicLink() || details.mode & 0o077 ||
    details.uid !== process.getuid()) {
    throw new Error("Replay incoming directory must be private and owned by the worker");
  }
  await cleanupStaleDownloads(incoming);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();
  try {
    if (args.length) {
      log({ matchId: Number(args[1]), queued: await enqueueOne(client, Number(args[1]), args[2] === "--download-only" ? "download" : "analysis") });
      return;
    }
    const recovered = await recoverStale(client);
    const job = await claim(client);
    if (!job) { log({ enabled: true, recovered, processed: 0 }); return; }
    try {
      log({ enabled: true, recovered, processed: 1, result: await handle(client, job, proxy) });
    } catch (error) {
      const status = job.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      const code = error?.code && /^[a-z_]{1,64}$/.test(error.code) ? error.code : "replay_processing_failed";
      await transition(client, job, status, code, message(error), null, status === "pending" ? retryDelaySeconds(job.attempts) : 0);
      log({ enabled: true, recovered, processed: 1, result: { matchId: job.matchId, status, code } });
    }
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(message(error)); process.exitCode = 1; });
