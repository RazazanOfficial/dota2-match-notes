#!/usr/bin/env node
// Operator-only replay ingestion. No public upload endpoint and no Next.js
// request ever handles the 60+ MB replay or runs a JVM.
import { createReadStream, createWriteStream } from "node:fs";
import { open, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

const MAX_INPUT = 200 * 1024 * 1024;
const MAX_DEM = 512 * 1024 * 1024;
const MAX_JSON = 16 * 1024 * 1024;
const scriptDir = dirname(fileURLToPath(import.meta.url));

function options(args) {
  const raw = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") { raw.dryRun = true; continue; }
    if (!["--match", "--file"].includes(arg) || !args[i + 1]) throw new Error("Usage: node scripts/replay-parser/import-replay.mjs --match ID --file FILE [--dry-run]");
    raw[arg.slice(2)] = args[++i];
  }
  const id = Number(raw.match);
  if (!Number.isSafeInteger(id) || id <= 0 || !raw.file) throw new Error("Positive match ID and replay file are required");
  return { matchId: id, file: resolve(raw.file), dryRun: raw.dryRun === true };
}

async function run(command, args, { timeoutMs = 120_000, outputLimit = 8_192 } = {}) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  const out = [], errors = [];
  let outBytes = 0, errorBytes = 0, exceeded = false, timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  child.stdout.on("data", (chunk) => {
    outBytes += chunk.length;
    if (outBytes > outputLimit) { exceeded = true; child.kill("SIGKILL"); }
    else out.push(chunk);
  });
  child.stderr.on("data", (chunk) => {
    errorBytes += chunk.length;
    if (errorBytes < 8_192) errors.push(chunk);
  });
  try {
    const code = await new Promise((done, reject) => {
      child.once("error", reject);
      child.once("close", done);
    });
    if (timedOut || exceeded || code !== 0) {
      throw new Error(`${command} failed (${timedOut ? "timeout" : exceeded ? "output limit" : code}): ${Buffer.concat(errors).toString("utf8").slice(-800)}`);
    }
    return Buffer.concat(out);
  } finally { clearTimeout(timeout); }
}

async function prepareDem(input, dir) {
  const source = await stat(input);
  const inputSize = source.size;
  if (!source.isFile() || inputSize > MAX_DEM) throw new Error("Replay input must be a regular file within the size limit");
  if (inputSize === 0 || inputSize > MAX_INPUT) throw new Error("Replay input size is outside the allowed range");
  const fd = await open(input, "r");
  const magic = Buffer.alloc(8);
  try { await fd.read(magic, 0, magic.length, 0); }
  finally { await fd.close(); }
  // The supplied reference file is named .bz2 but its magic bytes are zstd.
  const kind = magic.toString("ascii", 0, 7) === "PBDEMS2" ? "dem"
    : magic.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])) ? "zstd"
      : magic.toString("ascii", 0, 3) === "BZh" ? "bzip2" : null;
  if (!kind) throw new Error("Unsupported replay compression or invalid .dem header");
  if (kind === "dem") return input;
  const output = join(dir, "match.dem");
  const command = kind === "zstd" ? "zstd" : "bzip2";
  const child = spawn(command, ["-dc", input], { stdio: ["ignore", "pipe", "pipe"] });
  let bytes = 0, stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-500); });
  const limit = new Transform({ transform(chunk, _, done) {
    bytes += chunk.length;
    if (bytes > MAX_DEM) done(new Error("Decompressed replay exceeds size limit"));
    else done(null, chunk);
  } });
  const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
  try {
    const exit = new Promise((done, reject) => { child.once("error", reject); child.once("close", done); });
    await pipeline(child.stdout, limit, createWriteStream(output));
    const code = await exit;
    if (code !== 0 || bytes < 8) throw new Error(`Replay decompression failed: ${stderr}`);
    const header = Buffer.alloc(7);
    const stream = createReadStream(output, { start: 0, end: 6 });
    let position = 0;
    for await (const part of stream) { part.copy(header, position); position += part.length; }
    if (header.toString("ascii") !== "PBDEMS2") throw new Error("Decompressed file is not a Source 2 replay");
    return output;
  } catch (error) { child.kill("SIGKILL"); throw error; }
  finally { clearTimeout(timer); }
}

function verifyBlob(blob, matchId) {
  if (!blob || typeof blob !== "object" || blob.match_id !== 0 || !Number.isInteger(blob.version) ||
    !Array.isArray(blob.players) || blob.players.length !== 10) throw new Error("Parser JSON is incomplete");
  const slots = blob.players.map((player) => player?.player_slot);
  if (new Set(slots).size !== 10 || ![0, 1, 2, 3, 4, 128, 129, 130, 131, 132].every((slot) => slots.includes(slot))) {
    throw new Error("Parser JSON contains incomplete or duplicate player slots");
  }
  for (const player of blob.players) {
    const length = player.times?.length;
    if (!Number.isInteger(length) || length < 2 || length > 300 ||
      !["networth_t", "camps_stacked_t", "lh_t", "xp_t"].every((key) => player[key]?.length === length)) {
      throw new Error(`Incomplete replay timelines for player slot ${player.player_slot}`);
    }
  }
  blob.match_id = matchId; // identity was verified in CDemoFileInfo before parsing
  return blob;
}

async function store(matchId, blob) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required unless --dry-run is set");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await db.query("SELECT raw_data FROM dota_matches WHERE match_id = $1 FOR UPDATE", [matchId]);
    if (result.rowCount !== 1 || result.rows[0].raw_data?.match_id !== matchId ||
      !Array.isArray(result.rows[0].raw_data?.players)) throw new Error("OpenDota match summary must exist before replay import");
    await db.query(
      "UPDATE dota_matches SET local_replay_data = $2::jsonb, local_replay_parsed_at = now(), updated_at = now() WHERE match_id = $1",
      [matchId, JSON.stringify(blob)],
    );
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); await pool.end(); }
}

async function main() {
  const { matchId, file, dryRun } = options(process.argv.slice(2));
  const jar = process.env.REPLAY_PARSER_JAR;
  if (!jar || !(await stat(jar).catch(() => null))?.isFile()) throw new Error("REPLAY_PARSER_JAR must point to the built OpenDota parser jar");
  const workRoot = process.env.REPLAY_WORK_DIR || tmpdir();
  if (process.env.REPLAY_WORK_DIR) await mkdir(workRoot, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(join(workRoot, "dota2notes-replay-"));
  try {
    const dem = await prepareDem(file, work);
    await run("java", ["com.sun.tools.javac.Main", "-cp", jar, "-d", work, join(scriptDir, "ReplayInspector.java")], { timeoutMs: 30_000 });
    const result = await run("java", ["-Xmx1200m", "-cp", `${jar}:${work}`, "ReplayInspector", String(matchId), dem], { timeoutMs: 120_000, outputLimit: MAX_JSON });
    const blob = verifyBlob(JSON.parse(result.toString("utf8")), matchId);
    if (!dryRun) await store(matchId, blob);
    console.log(JSON.stringify({ matchId, mode: dryRun ? "validated" : "stored", parserVersion: blob.version,
      players: blob.players.length, timelinePoints: blob.players[0].times.length }));
  } finally { await rm(work, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
