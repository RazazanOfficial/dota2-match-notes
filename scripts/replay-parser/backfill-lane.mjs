#!/usr/bin/env node
// Reparse a single existing archived replay to add trusted minute-12 events.
// Operator-only; keeps the same archived file and does not enqueue downloads.
import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { retrieveReplay } from "./replay-archive.mjs";

const args = process.argv.slice(2);
const matchId = args.length === 2 && args[0] === "--match" ? Number(args[1]) : null;
if (!Number.isSafeInteger(matchId) || matchId <= 0) throw new Error("Usage: node backfill-lane.mjs --match ID");
if (!process.env.DATABASE_URL || !process.env.REPLAY_PARSER_JAR) throw new Error("DATABASE_URL and REPLAY_PARSER_JAR are required");
const { default: pg } = await import("pg");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let job;
try {
  const result = await db.query(`SELECT j.archive_key, j.archive_bytes,
    d.raw_data->>'match_id' AS summary_id, d.local_replay_data IS NOT NULL AS parsed
    FROM local_replay_jobs j JOIN dota_matches d ON d.match_id = j.match_id
    WHERE j.match_id = $1 AND j.archive_status = 'active'`, [matchId]);
  job = result.rows[0];
} finally { await db.end(); }
if (!job || Number(job.summary_id) !== matchId || !job.parsed) throw new Error("Existing summary, parser data and active archive are required");
const staging = process.env.LOCAL_REPLAY_INCOMING_DIR || "/var/lib/dota2notes/replays/incoming";
await mkdir(staging, { recursive: true, mode: 0o700 });
const work = await mkdtemp(join(process.env.REPLAY_WORK_DIR || tmpdir(), "lane-backfill-"));
let staged;
try {
  const archive = await retrieveReplay(job.archive_key, Number(job.archive_bytes), work);
  const name = archive.split("/").at(-1);
  staged = join(staging, name);
  await copyFile(archive, staged, constants.COPYFILE_EXCL);
  if (!(await stat(staged)).isFile()) throw new Error("Staging failed");
  const importer = fileURLToPath(new URL("./import-replay.mjs", import.meta.url));
  const child = spawn(process.execPath, [importer, "--match", String(matchId), "--file", staged],
    { stdio: "inherit", env: process.env });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  if (code !== 0) throw new Error(`Replay reimport failed: ${code}`);
} finally {
  if (staged) await rm(staged, { force: true });
  await rm(work, { recursive: true, force: true });
}
