#!/usr/bin/env node
// One bounded replay per invocation. Run as the dota2notes user in a dedicated
// systemd oneshot service, never inside a public Next.js request.
import { spawn } from "node:child_process";
import { lstat, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { cleanupStaleDownloads, downloadReplay, incomingFile, replayDescriptor, replayProxySettings, retryDelaySeconds } from "./replay-queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const incoming = process.env.LOCAL_REPLAY_INCOMING_DIR || "/var/lib/dota2notes/replays/incoming";
const MAX_ATTEMPTS = 4;

function message(error) { return (error instanceof Error ? error.message : String(error)).slice(0, 500); }
function log(result) { process.stdout.write(`${JSON.stringify(result)}\n`); }

async function assertProxyReady(proxy) {
  if (!proxy) return;
  const response = await fetch(`${proxy.url}/healthz`, {
    headers: { Authorization: `Bearer ${proxy.token}` },
    redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  if (response.status !== 200) throw new Error(`Replay proxy health returned HTTP ${response.status}`);
}

async function discover(client) {
  const result = await client.query(`
    INSERT INTO local_replay_jobs (match_id)
    SELECT dm.match_id FROM dota_matches dm
    WHERE dm.raw_data IS NOT NULL AND dm.local_replay_data IS NULL
      AND dm.started_at >= now() - interval '14 days'
      AND (dm.raw_data->>'replay_url' IS NOT NULL OR
        (dm.raw_data->>'cluster' IS NOT NULL AND dm.raw_data->>'replay_salt' IS NOT NULL))
      AND EXISTS (SELECT 1 FROM journal_matches jm WHERE jm.dota_match_id = dm.match_id)
      AND NOT EXISTS (SELECT 1 FROM local_replay_jobs job WHERE job.match_id = dm.match_id)
    ORDER BY dm.started_at DESC LIMIT 20
    ON CONFLICT DO NOTHING
  `);
  return result.rowCount;
}

async function enqueueOne(client, matchId) {
  const result = await client.query(`
    INSERT INTO local_replay_jobs (match_id)
    SELECT match_id FROM dota_matches WHERE match_id = $1 AND raw_data IS NOT NULL AND local_replay_data IS NULL
    ON CONFLICT (match_id) DO UPDATE SET status = 'pending', attempts = 0,
      run_after = now(), locked_at = NULL, finished_at = NULL,
      source = NULL, error_code = NULL, error_message = NULL, updated_at = now()
    WHERE local_replay_jobs.status IN ('failed', 'waiting_file')
    RETURNING match_id
  `, [matchId]);
  return result.rowCount === 1;
}

async function recoverStale(client) {
  const result = await client.query(`
    UPDATE local_replay_jobs SET
      status = CASE WHEN attempts >= $1 THEN 'failed' ELSE 'pending' END,
      run_after = now(), locked_at = NULL, updated_at = now(),
      error_code = 'stale_worker', error_message = 'Replay worker lease expired',
      finished_at = CASE WHEN attempts >= $1 THEN now() ELSE NULL END
    WHERE status = 'processing' AND locked_at < now() - interval '20 minutes'
  `, [MAX_ATTEMPTS]);
  return result.rowCount;
}

async function claim(client) {
  await client.query("BEGIN");
  try {
    const result = await client.query(`
      SELECT match_id, status, attempts, source FROM local_replay_jobs
      WHERE status IN ('pending', 'waiting_file') AND run_after <= now()
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, run_after, match_id
      LIMIT 1 FOR UPDATE SKIP LOCKED
    `);
    const candidate = result.rows[0];
    if (!candidate) { await client.query("COMMIT"); return null; }
    const updated = await client.query(`
      UPDATE local_replay_jobs SET status = 'processing', locked_at = now(), updated_at = now(),
        attempts = attempts + 1
      WHERE match_id = $1 RETURNING locked_at, attempts
    `, [candidate.match_id]);
    await client.query("COMMIT");
    return {
      matchId: Number(candidate.match_id),
      waitingFile: candidate.status === "waiting_file",
      source: candidate.source,
      attempts: updated.rows[0].attempts,
      lockedAt: updated.rows[0].locked_at,
    };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function transition(client, job, status, errorCode = null, errorMessage = null, source = null, delaySeconds = 0) {
  const result = await client.query(`
    UPDATE local_replay_jobs SET status = $3, error_code = $4, error_message = $5,
      source = COALESCE($6::varchar, source), run_after = now() + $7::integer * interval '1 second',
      locked_at = NULL, updated_at = now(),
      finished_at = CASE WHEN $3 IN ('completed','failed') THEN now() ELSE NULL END
    WHERE match_id = $1 AND status = 'processing' AND locked_at = $2 RETURNING match_id
  `, [job.matchId, job.lockedAt, status, errorCode, errorMessage, source, delaySeconds]);
  if (result.rowCount !== 1) throw new Error("Replay job lease was lost");
}

async function importReplay(matchId, path) {
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
  if (match.local_replay_data?.match_id === job.matchId && match.local_replay_data?.players?.length === 10) {
    await transition(client, job, "completed", null, null, "existing");
    return { matchId: job.matchId, status: "completed", source: "existing" };
  }
  const descriptor = replayDescriptor(match.raw_data, job.matchId);
  if (!descriptor) {
    await transition(client, job, "failed", "invalid_replay_metadata", "No valid Valve replay cluster/salt for this match");
    return { matchId: job.matchId, status: "failed", code: "invalid_replay_metadata" };
  }
  let file = await incomingFile(incoming, descriptor.filename) ||
    await incomingFile(incoming, descriptor.filename.replace(/\.bz2$/, ""));
  if (job.waitingFile && !file && (!proxy || job.source === "proxy")) {
    await transition(client, job, "waiting_file", "valve_access_blocked", "Waiting for a replay file in incoming", null, 300);
    return { matchId: job.matchId, status: "waiting_file" };
  }
  let downloaded = false;
  let downloadSource = null;
  if (!file) {
    try {
      const result = await downloadReplay(descriptor, incoming, fetch, proxy);
      file = result.path;
      downloaded = result.downloaded;
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
        await transition(client, job, "waiting_file", error?.code || "download_failed", message(error), proxy ? "proxy" : "valve", 300);
        return { matchId: job.matchId, status: "waiting_file", code: error?.code || "download_failed" };
      }
      throw error;
    }
  }
  try {
    await importReplay(job.matchId, file);
    await transition(client, job, "completed", null, null, downloadSource || "incoming");
    return { matchId: job.matchId, status: "completed", source: downloadSource || "incoming" };
  } finally {
    // Downloads are transient: the VPS has only a 20 GB disk. Operator-provided
    // replays are never removed by this worker.
    if (downloaded) await rm(file, { force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === "--enqueue" &&
    /^\d{1,16}$/.test(args[1]) && Number.isSafeInteger(Number(args[1])) && Number(args[1]) > 0)) {
    throw new Error("Usage: node scripts/replay-parser/run-queue.mjs [--enqueue MATCH_ID]");
  }
  if (!args.length && process.env.LOCAL_REPLAY_WORKER_ENABLED !== "true") {
    log({ enabled: false }); return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!process.env.REPLAY_PARSER_JAR) throw new Error("REPLAY_PARSER_JAR is required");
  const proxy = replayProxySettings();
  const details = await lstat(incoming);
  if (!details.isDirectory() || details.isSymbolicLink() || details.mode & 0o077 ||
    details.uid !== process.getuid()) {
    throw new Error("Replay incoming directory must be private and owned by the worker");
  }
  await cleanupStaleDownloads(incoming);
  if (!args.length) await assertProxyReady(proxy);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();
  try {
    if (args.length) {
      log({ matchId: Number(args[1]), queued: await enqueueOne(client, Number(args[1])) });
      return;
    }
    const recovered = await recoverStale(client);
    const discovered = await discover(client);
    const job = await claim(client);
    if (!job) { log({ enabled: true, recovered, discovered, processed: 0 }); return; }
    try {
      log({ enabled: true, recovered, discovered, processed: 1, result: await handle(client, job, proxy) });
    } catch (error) {
      const waiting = job.waitingFile;
      const status = waiting || job.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      const code = error?.code && /^[a-z_]{1,64}$/.test(error.code) ? error.code : "replay_processing_failed";
      await transition(client, job, status, code, message(error), null, status === "pending" ? retryDelaySeconds(job.attempts) : 0);
      log({ enabled: true, recovered, discovered, processed: 1, result: { matchId: job.matchId, status, code } });
    }
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(message(error)); process.exitCode = 1; });
