#!/usr/bin/env node
import "../env.mjs";
import pg from "pg";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { replayDescriptor } from "./replay-queue-utils.mjs";
import { downloadResilient, transportConfig } from "./replay-transport.mjs";
// Reads one match and deletes only its own new temporary directory. No enqueue/import.
const id=process.argv[2];
if(process.argv.length!==3||!/^\d{1,16}$/.test(id||"")||!Number.isSafeInteger(Number(id))||Number(id)<1)throw new Error("Usage: verify-direct-download MATCH_ID");
const config=transportConfig();
if(config.mode!=="direct")throw new Error("Set LOCAL_REPLAY_DOWNLOAD_MODE=direct for this check");
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
let directory;
try {
 await client.connect();
 const result=await client.query("SELECT raw_data FROM dota_matches WHERE match_id=$1",[id]);
 const descriptor=replayDescriptor(result.rows[0]?.raw_data,Number(id));
 if(!descriptor)throw new Error("No validated replay metadata stored for this match");
 directory=await mkdtemp(join(process.env.LOCAL_REPLAY_INCOMING_DIR||"/var/lib/dota2notes/replays/incoming",".migration-check-"));
 const started=Date.now();
 const replay=await downloadResilient(descriptor,join(directory,"download.part"),{},config,{
  phase:async phase=>console.log(JSON.stringify({phase})),
  progress:async p=>console.log(JSON.stringify({bytes:p.bytes,total:p.total,bps:p.bps})),
 },{maxAttempts:2});
 console.log(JSON.stringify({ok:true,matchId:Number(id),source:replay.source,bytes:replay.bytes,elapsedMs:Date.now()-started,sha256:replay.sha256,databaseChanged:false}));
} catch(error) {
 console.error(JSON.stringify({ok:false,code:/^[A-Za-z0-9_]{1,80}$/.test(error.code||"")?error.code:"direct_download_check_failed",name:error.name}));
 process.exitCode=1;
} finally {
 if(directory)await rm(directory,{recursive:true,force:true});
 await client.end().catch(()=>{});
}
