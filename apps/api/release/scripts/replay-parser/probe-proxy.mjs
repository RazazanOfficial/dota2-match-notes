#!/usr/bin/env node
import "../env.mjs";
import { requestRoute, selectRoutes, transportConfig, responseError, ReplayError } from "./replay-transport.mjs";
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || !/^[1-9]\d{0,3}$/.test(args[0]) || args.slice(1).some(x => !/^[1-9]\d{0,15}$/.test(x) || !Number.isSafeInteger(Number(x)))) {
    throw new Error("Usage: probe-proxy.mjs CLUSTER MATCH_ID REPLAY_SALT");
  }
  const config = transportConfig(); const routes = await selectRoutes(config);
  let last;
  for (const route of routes.slice(0, 3)) {
    let health, response;
    try {
      const headers = { Authorization: `Bearer ${config.token}` };
      health = await requestRoute(`${route.endpoint}/healthz`, route, headers, { totalMs: 15_000 });
      if (health.status !== 200) throw responseError(health);
      let healthText = "";
      for await (const part of health.body) { healthText += part.toString(); if (healthText.length > 64) throw new Error("Unexpected health response"); }
      if (healthText.trim() !== "ok") throw new Error("Unexpected health response");
      response = await requestRoute(`${route.endpoint}/v1/replay/${args.join("/")}`, route, { ...headers, Range: "bytes=0-31" }, { totalMs: 25_000 });
      if (response.status !== 206) throw responseError(response);
      if (!/^bytes 0-31\/\d+$/.test(response.headers.get("content-range") || "") || response.headers.get("content-length") !== "32") throw new Error("Invalid probe range");
      const chunks = []; let bytes = 0;
      for await (const part of response.body) { bytes += part.length; if (bytes > 32) throw new Error("Probe exceeded 32 bytes"); chunks.push(part); }
      const payload = Buffer.concat(chunks);
      if (bytes !== 32 || !(payload.subarray(0,3).toString() === "BZh" || payload.subarray(0,4).equals(Buffer.from([0x28,0xb5,0x2f,0xfd])) || payload.subarray(0,7).toString() === "PBDEMS2")) throw new Error("Probe response is not a replay");
      console.log(JSON.stringify({ ok:true, matchId:Number(args[1]), origin:route.endpoint, address:route.address, range:"0-31" })); return;
    } catch (error) {
      last = error;
      console.error(JSON.stringify({ok:false,phase:"probe",endpoint:route.endpoint,address:route.address,code:error.code || "probe_failed",message:error.message}));
      if (error instanceof ReplayError && !error.retryable) throw error;
    } finally { health?.close(); response?.close(); }
  }
  throw last || new Error("No relay route available");
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
