#!/usr/bin/env node
/** Read-only STRATZ probes. No application imports, database writes, or secret output. */
import https from "node:https";
import { spawn } from "node:child_process";
import { isIP } from "node:net";
import { gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LIMIT = 4 * 1024 * 1024;
const DEADLINE_MS = 20_000;
const MARKER = "\n__DOTA_STRATZ_DIAGNOSTIC__";
const WAIT = ms => new Promise(resolve => setTimeout(resolve, ms));
const HEADER_NAMES = ["content-type", "content-length", "content-encoding", "transfer-encoding", "cf-ray", "retry-after", "x-ratelimit-remaining-second", "x-ratelimit-remaining-minute", "x-ratelimit-remaining-hour", "x-ratelimit-remaining-day"];

export function redact(value, key) {
  return String(value ?? "").split(key).join("[REDACTED]").replace(/Bearer\s+[^\s"<>]+/gi, "Bearer [REDACTED]").slice(0, 400);
}

export function summarizeBody(buffer, key, monthEpoch) {
  let parsed;
  try { parsed = JSON.parse(buffer.toString("utf8")); }
  catch { return { jsonValid: false }; }
  const data = parsed?.data;
  const stats = data?.heroStats;
  return {
    jsonValid: true,
    matchFound: Boolean(data?.match?.id),
    ...(stats ? {
      metaRows: [1, 2, 3, 4, 5].map(p => Array.isArray(stats[`pos${p}`]) ? stats[`pos${p}`].length : null),
      requestedMonthRows: [1, 2, 3, 4, 5].map(p => Array.isArray(stats[`pos${p}`]) ? stats[`pos${p}`].filter(row => row?.month === monthEpoch).length : null),
      ...(Array.isArray(stats.stats) ? {
        performanceRows: stats.stats.length,
        performancePositions: [...new Set(stats.stats.map(row => row.position))],
        performanceWeeks: [...new Set(stats.stats.map(row => row.week))],
        rowsAtTime13: stats.stats.filter(row => row.time === 13).length,
      } : {}),
    } : {}),
    graphqlErrors: Array.isArray(parsed?.errors) ? parsed.errors.slice(0, 10).map(e => redact(e?.message, key)) : [],
    ...((typeof parsed?.message === "string" || typeof parsed?.error === "string") ? { providerMessage: redact(parsed.message || parsed.error, key) } : {}),
  };
}

function selectedHeaders(headers, key) {
  return Object.fromEntries(HEADER_NAMES.filter(name => headers[name] !== undefined).map(name => [name, redact(headers[name], key)]));
}

export function buildQueries(month, now, heroIds) {
  const monthsBack = (now.getUTCFullYear() - month.getUTCFullYear()) * 12 + now.getUTCMonth() - month.getUTCMonth();
  if (monthsBack < 1 || monthsBack > 11) throw new Error("Month must be a completed month within the last 11 months");
  const take = monthsBack + 1;
  const selection = (p, rank, mode) => `pos${p}: winMonth(take: ${take}, bracketIds: [${rank}], positionIds: [POSITION_${p}], gameModeIds: [${mode}]) { month heroId matchCount winCount }`;
  const meta = (rank = "DIVINE", mode = "ALL_PICK_RANKED", positions = [1, 2, 3, 4, 5]) => JSON.stringify({ operationName: "MonthlyMeta", query: `query MonthlyMeta { heroStats { ${positions.map(p => selection(p, rank, mode)).join("\n")} } }` });
  const weekMs = Math.ceil(month.getTime() / 604_800_000) * 604_800_000;
  const performance = JSON.stringify({ operationName: "MonthlyPerformance", query: `query MonthlyPerformance { heroStats { stats(week: ${weekMs / 1000}, heroIds: [${heroIds.join(",")}], bracketBasicIds: [DIVINE_IMMORTAL], positionIds: [POSITION_1,POSITION_2,POSITION_3,POSITION_4,POSITION_5], groupByTime: true, groupByPosition: true, groupByBracket: true, minTime: 0, maxTime: 75) { heroId week time position bracketBasicIds matchCount remainingMatchCount cs dn kills deaths assists networth xp heroDamage towerDamage healingAllies campsStacked neutrals ancients teamKills } } }` });
  const small = JSON.stringify({ operationName: "ConnectivityCheck", query: "query ConnectivityCheck { match(id: 9034129766) { id } }" });
  return { meta, performance, small, weekMs };
}

function capture(command, args, input = "", outputLimit = LIMIT) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let bytes = 0, stderr = "", exceeded = false, spawnError, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, DEADLINE_MS + 5_000);
    child.stdin.on("error", () => {});
    child.on("error", e => { spawnError = e.code || e.name; });
    child.stdout.on("data", chunk => {
      if (exceeded) return;
      bytes += chunk.length;
      if (bytes > outputLimit) { exceeded = true; child.kill("SIGKILL"); }
      else chunks.push(chunk);
    });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(0, 32768); });
    child.on("close", exitCode => {
      clearTimeout(timer);
      resolve({ exitCode, stdout: Buffer.concat(chunks), stderr, exceeded, spawnError, timedOut, elapsedMs: Date.now() - started });
    });
    child.stdin.end(input);
  });
}

function curlConfig(config, test) {
  const headers = ["User-Agent: STRATZ_API", "Content-Type: application/json", "Accept: application/json", `Authorization: Bearer ${config.key}`, `Accept-Encoding: ${test.gzip ? "gzip" : "identity"}`];
  const lines = [
    `url = ${JSON.stringify(config.url.toString())}`,
    ...headers.map(header => `header = ${JSON.stringify(header)}`),
    `data-binary = ${JSON.stringify(test.body)}`,
    `write-out = ${JSON.stringify(`${MARKER}%{http_code}|%{http_version}|%{remote_ip}|%{time_appconnect}|%{time_starttransfer}|%{time_total}|%{size_download}`)}`,
  ];
  if (!test.dns) lines.push(`resolve = ${JSON.stringify(`${config.url.hostname}:${config.url.port || 443}:${config.ip}`)}`);
  return lines.join("\n") + "\n";
}

async function runCurl(config, test) {
  const args = ["--disable", "--config", "-", test.h2 ? "--http2" : "--http1.1", "--noproxy", "*", "--ipv4", "--connect-timeout", "5", "--max-time", "20", "--silent", "--show-error", "--dump-header", "-"];
  if (test.gzip) args.push("--compressed");
  const result = await capture("curl", args, curlConfig(config, test));
  const out = result.stdout.toString();
  const split = out.lastIndexOf(MARKER);
  const values = split < 0 ? [] : out.slice(split + MARKER.length).trim().split("|");
  const responseText = split < 0 ? out : out.slice(0, split);
  let offset = 0;
  const headers = {};
  while (/^HTTP\/[\d.]+ \d{3}/.test(responseText.slice(offset))) {
    const separator = /\r?\n\r?\n/.exec(responseText.slice(offset));
    if (!separator) break;
    const block = responseText.slice(offset, offset + separator.index);
    for (const line of block.split(/\r?\n/).slice(1)) {
      const at = line.indexOf(":");
      if (at > 0) headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim();
    }
    offset += separator.index + separator[0].length;
  }
  const messages = result.stderr.split(/\r?\n/).filter(line => /^curl:/.test(line)).map(line => redact(line, config.key));
  const body = Buffer.from(responseText.slice(offset));
  return {
    transport: "curl", exitCode: result.exitCode, elapsedMs: result.elapsedMs,
    http: values[0] ? Number(values[0]) : null, httpVersion: values[1] || null,
    remoteIp: values[2] || null, tlsSeconds: values[3] ? Number(values[3]) : null,
    firstByteSeconds: values[4] ? Number(values[4]) : null,
    transferSeconds: values[5] ? Number(values[5]) : null,
    receivedWireBytes: values[6] ? Number(values[6]) : null,
    decodedBodyBytes: body.length,
    transferComplete: result.exitCode === 0 && !result.exceeded && !result.timedOut,
    headers: selectedHeaders(headers, config.key),
    errors: messages, ...(result.spawnError ? { spawnError: result.spawnError } : {}),
    responseLimitExceeded: result.exceeded, supervisorTimeout: result.timedOut,
    ...summarizeBody(body, config.key, config.month.getTime() / 1000),
  };
}

async function runNode(config, test) {
  return new Promise(resolve => {
    const started = Date.now();
    let finished = false, http = null, bytes = 0, tlsMs = null, headersMs = null, headers = {}, incoming;
    const chunks = [];
    const done = result => {
      if (finished) return;
      finished = true;
      const report = { transport: "node:https", elapsedMs: Date.now() - started, http, tlsMs, headersMs, receivedWireBytes: bytes, headers: selectedHeaders(headers, config.key), ...result };
      req.destroy();
      incoming?.destroy();
      resolve(report);
    };
    const req = https.request({
      hostname: config.ip, servername: config.url.hostname,
      port: config.url.port || 443, path: config.url.pathname,
      method: "POST", agent: false, rejectUnauthorized: true,
      signal: AbortSignal.timeout(DEADLINE_MS),
      headers: { Host: config.url.host, Authorization: `Bearer ${config.key}`, "User-Agent": "STRATZ_API", "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": test.gzip ? "gzip" : "identity", "Content-Length": Buffer.byteLength(test.body) },
    }, res => {
      incoming = res; http = res.statusCode; headers = res.headers; headersMs = Date.now() - started;
      res.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > LIMIT) done({ transferComplete: false, error: "response_limit_exceeded" });
        else chunks.push(chunk);
      });
      res.on("error", e => done({ transferComplete: false, error: e.code || e.name, message: redact(e.message, config.key) }));
      res.on("end", () => {
        if (finished) return;
        try {
          const encoded = Buffer.concat(chunks);
          const encoding = String(headers["content-encoding"] || "identity").toLowerCase().trim();
          if (!["gzip", "identity"].includes(encoding)) return done({ transferComplete: false, error: "unexpected_content_encoding" });
          const decoded = encoding === "gzip" ? gunzipSync(encoded, { maxOutputLength: LIMIT }) : encoded;
          done({ transferComplete: Boolean(res.complete), decodedBodyBytes: decoded.length, ...summarizeBody(decoded, config.key, config.month.getTime() / 1000) });
        } catch (e) { done({ transferComplete: false, error: e.code || e.name, message: redact(e.message, config.key) }); }
      });
    });
    req.on("socket", socket => { socket.once("secureConnect", () => { tlsMs = Date.now() - started; }); });
    req.setTimeout(test.socketTimeout || DEADLINE_MS, () => done({ transferComplete: false, error: "socket_inactivity_timeout" }));
    req.on("error", e => done({ transferComplete: false, error: e.code || e.name, message: redact(e.message, config.key) }));
    req.write(test.body);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
  const now = new Date();
  const monthString = option("--month", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7));
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(monthString || "")) throw new Error("Invalid --month; expected YYYY-MM");
  const month = new Date(`${monthString}-01T00:00:00Z`);
  const url = new URL(process.env.STRATZ_API_URL || "https://api.stratz.com/graphql");
  const key = process.env.STRATZ_API_TOKEN?.trim();
  const ip = process.env.STRATZ_DIRECT_IP?.trim();
  if (!key || /[\r\n]/.test(key) || isIP(ip || "") !== 4 || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Missing token or invalid STRATZ endpoint/IP configuration");
  const rawInterval = Number(process.env.STRATZ_MIN_REQUEST_INTERVAL_MS || 2000);
  if (!Number.isInteger(rawInterval) || rawInterval < 1000 || rawInterval > 60000) throw new Error("Invalid STRATZ_MIN_REQUEST_INTERVAL_MS");
  const interval = Math.max(2000, rawInterval);
  const source = await readFile(new URL("../src/data/heroes.ts", import.meta.url), "utf8");
  const heroIds = [...source.matchAll(/\{\s*id:\s*(\d+)/g)].slice(0, 4).map(match => Number(match[1]));
  if (heroIds.length !== 4) throw new Error("Could not read the production first hero batch");
  const queries = buildQueries(month, now, heroIds);
  const config = { url, key, ip, month };
  const curlVersion = await capture("curl", ["--disable", "--version"], "", 32768);
  if (curlVersion.exitCode !== 0) throw new Error("curl is not available");
  const hasHttp2 = /Features:.*\bHTTP2\b/.test(curlVersion.stdout.toString());
  const tests = [
    { name: "curl-small-control", body: queries.small },
    { name: "curl-small-padded-2048", body: queries.small.padEnd(2048, " ") },
    { name: "curl-meta-single-position-identity", body: queries.meta("DIVINE", "ALL_PICK_RANKED", [1]) },
    { name: "curl-meta-full-identity", body: queries.meta() },
    ...["DIVINE", "IMMORTAL"].flatMap(rank => ["ALL_PICK_RANKED", "TURBO"].map(mode => ({ name: `curl-meta-${rank}-${mode}-gzip`, body: queries.meta(rank, mode), gzip: true }))),
    { name: "curl-performance-full-identity", body: queries.performance },
    { name: "curl-performance-full-gzip", body: queries.performance, gzip: true },
    { name: "curl-meta-full-dns-gzip", body: queries.meta(), gzip: true, dns: true },
    ...(hasHttp2 ? [{ name: "curl-meta-full-http2-gzip", body: queries.meta(), gzip: true, h2: true }] : []),
    { name: "node-meta-production-5s-identity", body: queries.meta(), node: true, socketTimeout: 5000 },
    { name: "node-meta-full-gzip", body: queries.meta(), node: true, gzip: true },
    { name: "node-performance-full-gzip", body: queries.performance, node: true, gzip: true },
  ];
  const report = {
    version: 1, startedAt: now.toISOString(), referenceMonth: monthString,
    endpoint: url.origin + url.pathname, pinnedIp: ip, nodeVersion: process.version,
    curlVersion: curlVersion.stdout.toString().split(/\r?\n/)[0], curlHttp2Supported: hasHttp2,
    heroBatch: heroIds, performanceWeekUnix: queries.weekMs / 1000,
    performanceWeekNumber: queries.weekMs / 604_800_000,
    configuredTimeoutMs: process.env.STRATZ_TIMEOUT_MS || "default 20000",
    intervalMs: interval, readOnly: true, tests: [],
  };
  console.log(`Running ${tests.length} read-only tests; allow up to ${Math.ceil(tests.length * (25_000 + interval) / 60_000)} minutes.`);
  console.log("No database, service, ENV, or routing changes will be made.");
  for (const [i, test] of tests.entries()) {
    if (i) await WAIT(interval);
    console.log(`[${i + 1}/${tests.length}] ${test.name}`);
    const result = await (test.node ? runNode(config, test) : runCurl(config, test));
    report.tests.push({ name: test.name, requestBytes: Buffer.byteLength(test.body), ...result });
    console.log(JSON.stringify({ test: test.name, http: result.http, complete: result.transferComplete, jsonValid: result.jsonValid ?? false, bytes: result.receivedWireBytes, error: result.error || result.errors?.join(" ") || null }));
    if (result.http === 429) {
      report.stoppedForRateLimit = true;
      console.log("Provider rate limit received; remaining tests were skipped.");
      break;
    }
  }
  report.completedAt = new Date().toISOString();
  const outputDir = resolve(option("--output-dir", "."));
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const reportPath = join(outputDir, `stratz-diagnostics-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(`REPORT: ${reportPath}`);
  console.log("Send this JSON report; it contains no token or raw API response.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const key = process.env.STRATZ_API_TOKEN?.trim();
    console.error("Diagnostics stopped:", key ? redact(error.message, key) : "Missing token or diagnostics setup failed");
    process.exitCode = 1;
  });
}
