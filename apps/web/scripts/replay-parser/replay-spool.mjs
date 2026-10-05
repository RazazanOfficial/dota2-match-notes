import { createReadStream } from "node:fs";
import { lstat, readdir, rm, statfs } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { MAX_REPLAY_BYTES } from "./replay-queue-utils.mjs";
import { ReplayError } from "./replay-transport.mjs";
export const SPOOL_NAME = /^\.replay-[0-9a-f-]{36}\.part$/;
export const SPOOL_CAP = 1024 ** 3;
export const MIN_FREE = 2 * 1024 ** 3;
export function spoolPath(directory, name) {
  if (!SPOOL_NAME.test(name || "")) throw new ReplayError("replay_checkpoint_invalid", "Invalid replay checkpoint filename", { retryable: false });
  return join(directory, name);
}
export async function inspectSpool(directory, name) {
  const path = spoolPath(directory, name);
  const file = await lstat(path).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (!file) return null;
  if (!file.isFile() || file.isSymbolicLink() || (process.getuid && (file.uid !== process.getuid() || file.mode & 0o077)) || file.size > MAX_REPLAY_BYTES) {
    throw new ReplayError("replay_checkpoint_invalid", "Unsafe replay checkpoint", { retryable: false });
  }
  return { path, bytes: file.size };
}
export async function ensureCapacity(directory, existingBytes = 0, filesystem = statfs) {
  let used = 0;
  for (const name of await readdir(directory)) if (SPOOL_NAME.test(name)) {
    const file = await lstat(join(directory, name)).catch(() => null);
    if (file?.isFile()) used += file.size;
  }
  const disk = await filesystem(directory);
  const required = MAX_REPLAY_BYTES - existingBytes;
  if (used + required > SPOOL_CAP || disk.bavail * disk.bsize - required < MIN_FREE) {
    throw new ReplayError("replay_disk_capacity", "Replay staging is full or disk reserve is below 2 GiB");
  }
}
export async function verifyCheckpoint(file, expectedHash, expectedBytes) {
  if (!file || file.bytes !== Number(expectedBytes) || !/^[0-9a-f]{64}$/.test(expectedHash || "")) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file.path)) hash.update(chunk);
  return hash.digest("hex") === expectedHash;
}
// Called only while holding the global worker lock. Legacy .dem files are never touched.
export async function cleanSpool(client, directory) {
  const { rows } = await client.query("SELECT match_id, spool_name, spool_created_at, status FROM local_replay_jobs WHERE spool_name IS NOT NULL");
  const live = new Set();
  for (const row of rows) {
    if (row.status !== "processing" && Date.now() - new Date(row.spool_created_at || 0).getTime() >= 86_400_000) {
      await rm(spoolPath(directory, row.spool_name), { force: true });
      await client.query(`UPDATE local_replay_jobs SET spool_name=NULL, spool_complete=false, spool_etag=NULL,
        spool_sha256=NULL, downloaded_bytes=0, total_bytes=NULL, spool_created_at=NULL WHERE match_id=$1 AND spool_name=$2`, [row.match_id, row.spool_name]);
    } else live.add(row.spool_name);
  }
  for (const name of await readdir(directory)) if (SPOOL_NAME.test(name) && !live.has(name)) {
    const file = await lstat(join(directory, name)).catch(() => null);
    if (file?.isFile() && (!process.getuid || file.uid === process.getuid()) && Date.now() - file.mtimeMs > 3_600_000) await rm(join(directory, name), { force: true });
  }
  await client.query("DELETE FROM replay_job_events WHERE created_at < now() - interval '30 days'");
  await client.query("DELETE FROM replay_transport_routes WHERE updated_at < now() - interval '7 days'");
}
