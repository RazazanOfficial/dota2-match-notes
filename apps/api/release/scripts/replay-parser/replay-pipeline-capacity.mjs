import {lstat,readdir,statfs} from "node:fs/promises";
import {join} from "node:path";
import {MAX_REPLAY_BYTES} from "./replay-queue-utils.mjs";
import {MIN_FREE,SPOOL_NAME} from "./replay-spool.mjs";
import {ReplayError} from "./replay-transport.mjs";
// Reservations and actual files are counted under a shared transaction lock.
export async function reserveCapacity(client,job,directory,existingBytes=0,filesystem=statfs) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(73341018)");
    const cap=Number(process.env.LOCAL_REPLAY_SPOOL_CAP_MIB || 2048);
    if(!Number.isInteger(cap)||cap<400||cap>8192)throw new Error("Invalid replay spool capacity");
    let used=0;
    for(const name of await readdir(directory)) if(SPOOL_NAME.test(name)) {
      const info=await lstat(join(directory,name)).catch(()=>null);if(info?.isFile())used+=info.size;
    }
    const other=Number((await client.query("SELECT coalesce(sum(reserved_bytes),0) AS bytes FROM local_replay_jobs WHERE match_id<>$1 AND status='processing'",[job.match_id])).rows[0].bytes);
    const required=Math.max(0,MAX_REPLAY_BYTES-existingBytes),disk=await filesystem(directory);
    if(used+other+required>cap*1048576 || disk.bavail*disk.bsize-other-required<MIN_FREE)
      throw new ReplayError("replay_disk_capacity","Replay staging capacity is reserved; retry later",{retryAfter:60});
    const result=await client.query("UPDATE local_replay_jobs SET reserved_bytes=$3 WHERE match_id=$1 AND status='processing' AND locked_at=$2::timestamptz RETURNING match_id",[job.match_id,job.lease,required]);
    if(result.rowCount!==1)throw new ReplayError("replay_lease_lost","Replay lease changed",{retryable:false});
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}
}
