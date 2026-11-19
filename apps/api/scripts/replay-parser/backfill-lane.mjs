#!/usr/bin/env node
// Reparse a single existing archived replay to add trusted v2 minute-10 events.
// Operator-only; keeps the same archived file and does not enqueue downloads.
import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { retrieveReplay } from "./replay-archive.mjs";

export function backfillOptions(args) {
  const force = args.length === 3 && args[2] === "--force";
  const matchId = (args.length === 2 || force) && args[0] === "--match" && /^[1-9][0-9]*$/.test(args[1])
    ? Number(args[1]) : null;
  if (!Number.isSafeInteger(matchId) || matchId <= 0) throw new Error("Usage: node backfill-lane.mjs --match ID [--force]");
  return { matchId, force };
}

export function needsLaneBackfill(events) {
  const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
  return !events || events.version !== 2 || events.snapshotAt !== 600 || events.coordinateSystem !== "dota-grid" ||
    !Array.isArray(events.snapshots) || events.snapshots.length !== 10 ||
    !slots.every(slot => events.snapshots.filter(row => row?.slot === slot && row.time === 600).length === 1) ||
    ![events.combat, events.assists, events.purchases, events.wards].every(Array.isArray);
}

export async function main(args = process.argv.slice(2)) {
  const { matchId, force } = backfillOptions(args);
  await import("../env.mjs");
  const { requireComputeNode } = await import("../node-role.mjs");
  requireComputeNode();
  if (!process.env.DATABASE_URL || !process.env.REPLAY_PARSER_JAR) throw new Error("DATABASE_URL and REPLAY_PARSER_JAR are required");
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let job;
  try {
    const result = await db.query(`SELECT j.archive_key, j.archive_bytes,
      d.raw_data->>'match_id' AS summary_id, d.local_replay_data IS NOT NULL AS parsed,
      d.local_replay_data->'lane_events' AS lane_events
      FROM local_replay_jobs j JOIN dota_matches d ON d.match_id = j.match_id
      WHERE j.match_id = $1 AND j.archive_status = 'active'`, [matchId]);
    job = result.rows[0];
  } finally { await db.end(); }
  if (!job || Number(job.summary_id) !== matchId || !job.parsed) throw new Error("Existing summary, parser data and active archive are required");
  if (!force && !needsLaneBackfill(job.lane_events)) {
    console.log(JSON.stringify({ matchId, status: "already_current", laneVersion: 2, snapshotAt: 600 }));
    return;
  }
  const staging = process.env.LOCAL_REPLAY_INCOMING_DIR || "/var/lib/dota2notes/replays/incoming";
  await mkdir(staging, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(join(process.env.REPLAY_WORK_DIR || tmpdir(), "lane-backfill-"));
  let staged;
  try {
    const archive = await retrieveReplay(job.archive_key, Number(job.archive_bytes), work);
    const name = archive.split("/").at(-1);
    const target = join(staging, name);
    await copyFile(archive, target, constants.COPYFILE_EXCL);
    staged = target;
    if (!(await stat(staged)).isFile()) throw new Error("Staging failed");
    const importer = fileURLToPath(new URL("./import-replay.mjs", import.meta.url));
    const child = spawn(process.execPath, [importer, "--match", String(matchId), "--file", staged],
      { stdio: "inherit", env: process.env });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (code !== 0) throw new Error(`Replay reimport failed: ${code}`);
    // The importer deliberately preserves general replay analysis if Lane extraction
    // fails. Its zero exit alone does not establish that this backfill succeeded.
    const verify = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await verify.connect();
    try {
      const result = await verify.query("SELECT local_replay_data->'lane_events' AS lane_events FROM dota_matches WHERE match_id=$1", [matchId]);
      if (needsLaneBackfill(result.rows[0]?.lane_events)) throw new Error("Replay imported without current Lane events");
    } finally { await verify.end(); }
    console.log(JSON.stringify({ matchId, status: "updated", laneVersion: 2, snapshotAt: 600 }));
  } finally {
    if (staged) await rm(staged, { force: true });
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => {
  const message = error instanceof Error ? error.message : "";
  // Storage SDK errors may include signed URLs; only print our fixed diagnostics.
  const safe = /^Usage: node backfill-lane\.mjs/.test(message) ||
    /^(?:DATABASE_URL and REPLAY_PARSER_JAR are required|Existing summary, parser data and active archive are required|Staging failed|Replay imported without current Lane events|Replay reimport failed: (?:[0-9]+|null))$/.test(message);
  console.error(safe ? message : "Lane backfill failed; inspect the sanitized worker diagnostics");
  process.exitCode = 1;
});
