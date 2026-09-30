#!/usr/bin/env node
import { fetchReplayMetadata } from "./replay-metadata.mjs";
import { transportConfig } from "./replay-transport.mjs";

const value = process.argv[2];
const cluster = process.argv[3];
if (!/^[1-9]\d{0,15}$/.test(value || "") || !Number.isSafeInteger(Number(value)) ||
  cluster !== undefined && (!/^[1-9]\d{0,3}$/.test(cluster) || Number(cluster) > 9999)) {
  console.error("Usage: probe-metadata.mjs MATCH_ID [KNOWN_CLUSTER]");
  process.exitCode = 1;
} else {
  const matchId = Number(value);
  try {
    const metadata = await fetchReplayMetadata(matchId, { match_id: matchId, cluster: cluster && Number(cluster) }, transportConfig(), {
      routes: async () => [],
      event: async (_phase, code, _detail, route) => console.log(JSON.stringify({ code, address: route.address })),
    });
    console.log(JSON.stringify({ ok: true, matchId, ...metadata }));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, matchId, code: error.code || "metadata_probe_failed" }));
    process.exitCode = 1;
  }
}
