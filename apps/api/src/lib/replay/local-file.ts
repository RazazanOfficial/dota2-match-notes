import {hasPrivateReplayPermissions} from "./local-file-permissions";
import {constants} from "node:fs";
import {open,lstat} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {and,eq} from "drizzle-orm";
import {getDb} from "../db";
import {localReplayJobs} from "../db/schema";
import {REPLAY_MAX_BYTES} from "./archive-storage";
// Validate and stream the same descriptor; symlinks cannot replace the file.
export async function localReplayFile(matchId:number,verify=false) {
  const [row]=await getDb().select({name:localReplayJobs.spoolName,complete:localReplayJobs.spoolComplete,bytes:localReplayJobs.totalBytes,sha256:localReplayJobs.spoolSha256}).from(localReplayJobs).where(eq(localReplayJobs.matchId,matchId)).limit(1);
  if(!row?.complete||!/^\.replay-[0-9a-f-]{36}\.part$/.test(row.name||"")||!/^[0-9a-f]{64}$/.test(row.sha256||"")||!row.bytes||row.bytes>REPLAY_MAX_BYTES)return null;
  const directory=process.env.LOCAL_REPLAY_INCOMING_DIR||"/var/lib/dota2notes/replays/incoming";let file;
  try{
    const dir=await lstat(directory);
    if(!dir.isDirectory()||dir.isSymbolicLink()||!hasPrivateReplayPermissions(dir))return null;
    const path=join(directory,row.name!),entry=await lstat(path);
    if(!entry.isFile()||entry.isSymbolicLink())return null;
    file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW || 0));
    const info=await file.stat();
    if(!info.isFile()||info.dev!==entry.dev||info.ino!==entry.ino||info.size!==row.bytes||!hasPrivateReplayPermissions(info)){await file.close();return null;}
    if(!verify){await file.close();return {bytes:row.bytes};}
    const hash=createHash("sha256");for await(const chunk of file.createReadStream({start:0,autoClose:false}))hash.update(chunk);
    if(hash.digest("hex")!==row.sha256){
      await file.close();await getDb().update(localReplayJobs).set({spoolComplete:false,spoolSha256:null,spoolEtag:null,totalBytes:null,downloadedBytes:0})
        .where(and(eq(localReplayJobs.matchId,matchId),eq(localReplayJobs.spoolName,row.name!),eq(localReplayJobs.spoolSha256,row.sha256!)));return null;
    }
    return {bytes:row.bytes,stream:file.createReadStream({start:0,autoClose:true})};
  }catch(error){await file?.close().catch(()=>{});if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
}
