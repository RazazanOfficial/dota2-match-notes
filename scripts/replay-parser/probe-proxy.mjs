#!/usr/bin/env node
// Read-only connectivity test: Worker -> Valve and Iran VPS -> Worker.
import { replayProxySettings } from "./replay-queue-utils.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || !/^([1-9]\d{0,3})$/.test(args[0]) ||
    args.slice(1).some((item) => !/^[1-9]\d{0,15}$/.test(item) || !Number.isSafeInteger(Number(item)))) {
    throw new Error("Usage: node probe-proxy.mjs CLUSTER MATCH_ID REPLAY_SALT");
  }
  const proxy = replayProxySettings();
  if (!proxy) throw new Error("Set LOCAL_REPLAY_PROXY_URL and LOCAL_REPLAY_PROXY_TOKEN first");
  const headers = { Authorization: `Bearer ${proxy.token}` };
  const health = await fetch(`${proxy.url}/healthz`, {
    headers, redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (health.status !== 200 || (await health.text()).trim() !== "ok") {
    throw new Error(`Replay proxy health failed: HTTP ${health.status}`);
  }
  const response = await fetch(`${proxy.url}/v1/replay/${args.join("/")}`, {
    headers: { ...headers, Range: "bytes=0-31" },
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 206 || !/^bytes 0-31\/\d+$/.test(response.headers.get("content-range") || "") ||
    response.headers.get("content-length") !== "32" || !response.body) {
    await response.body?.cancel();
    throw new Error(`Replay probe failed: HTTP ${response.status}, range ${response.headers.get("content-range")}`);
  }
  const reader = response.body.getReader();
  let bytes = 0;
  const header = Buffer.alloc(4);
  try {
    while (bytes < 4) {
      const { value, done } = await reader.read();
      if (done) break;
      header.set(value.subarray(0, Math.min(4 - bytes, value.length)), bytes);
      bytes += value.length;
      if (bytes > 32) throw new Error("Probe exceeded 32 bytes");
    }
  } finally { await reader.cancel(); }
  if (bytes < 4 || !(header.subarray(0, 3).toString("ascii") === "BZh" ||
    header.equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])))) {
    throw new Error("Proxy response is not a compressed replay");
  }
  console.log(JSON.stringify({ ok: true, matchId: Number(args[1]), origin: proxy.url, range: "0-31" }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
