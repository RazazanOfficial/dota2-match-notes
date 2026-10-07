#!/usr/bin/env node
import "../env.mjs";
// Operator-only end-to-end transport test. Uses the production downloader,
// downloads one full replay, verifies it, and removes the temporary file.
// Does not change the queue, hosts file, database, archive, or persistent route health.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { downloadResilient, requestRoute, selectRoutes, transportConfig, ReplayError } from "./replay-transport.mjs";
const args = process.argv.slice(2);
async function main() {
  if (args.length !== 4 || !["--full", "--full-test-failover"].includes(args[3]) ||
    !/^[1-9]\d{0,3}$/.test(args[0]) || args.slice(1,3).some(x => !/^[1-9]\d{0,15}$/.test(x) || !Number.isSafeInteger(Number(x)))) {
    throw new Error("Usage: verify-failover.mjs CLUSTER MATCH_ID SALT --full|--full-test-failover");
  }
  const config = transportConfig();
  const routes = await selectRoutes(config);
  const simulate = args[3] === "--full-test-failover";
  // An unreachable first address is injected only into this process. No request
  // or token is ever sent there. The next route must perform a REAL full download.
  const faultAddress = "203.0.113.1";
  const blockedRoute = route => route.address === faultAddress;
  if (simulate) console.log(JSON.stringify({test:"synthetic-first-address-failure",address:faultAddress,networkChanges:false}));
  const work = await mkdtemp(join(tmpdir(), "replay-failover-"));
  let injected = 0, successfulRoute = null;
  try {
    const result = await downloadResilient({ cluster: Number(args[0]), matchId: Number(args[1]), salt: Number(args[2]) },
      join(work, `.replay-${randomUUID()}.part`), {}, config, {
        event: async (phase,code,detail,route) => console.log(JSON.stringify({phase,code,detail,endpoint:route.endpoint,address:route.address})),
        progress: async p => console.log(JSON.stringify({phase:"downloading",bytes:p.bytes,total:p.total,bps:p.bps})),
        routeSuccess: async route => { successfulRoute = route; },
      }, {
        resolver: async host => [...(simulate && host === new URL(config.origins[0]).hostname ? [faultAddress] : []), ...routes.filter(route => new URL(route.endpoint).hostname === host).map(route => route.address)],
        request: async (url,route,headers,options) => {
          if (simulate && blockedRoute(route)) { injected++; throw new ReplayError("simulated_primary_outage", "TEST: primary route deliberately failed", {circuit:true}); }
          return requestRoute(url,route,headers,options);
        },
      });
    if (simulate && (!injected || !successfulRoute || blockedRoute(successfulRoute))) throw new Error("Failover was not demonstrated");
    console.log(JSON.stringify({ok:true,mode:simulate?"fault-injection-full-download":"full-download",matchId:Number(args[1]),bytes:result.bytes,sha256:result.sha256,
      injectedFailures:injected,endpoint:successfulRoute?.endpoint,address:successfulRoute?.address,temporaryFileWillBeRemoved:true}));
  } finally { await rm(work,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error instanceof ReplayError?`${error.code}: ${error.message}`:error.message);process.exitCode=1;});
