import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync, chmodSync, chownSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Installed as a root-owned file outside the application checkout. No request input
// is ever passed to systemctl or journalctl.
export const UNITS = Object.freeze([
  "dota2notes.service", "dota2notes-images.timer", "dota2notes-images.service",
  "dota2notes-opendota-parse.timer", "dota2notes-opendota-parse.service",
  "dota2notes-replay.timer", "dota2notes-replay.service",
  "dota2notes-performance-reference.timer", "dota2notes-performance-reference.service",
  "dota2notes-sync.timer", "dota2notes-sync.service",
  "dota2notes-stratz.timer", "dota2notes-stratz.service",
  "nginx.service", "postgresql.service",
]);
const FIELDS = ["Id", "LoadState", "UnitFileState", "ActiveState", "SubState", "Result", "ExecMainStatus", "ActiveEnterTimestamp", "InactiveEnterTimestamp", "ExecMainStartTimestamp", "ExecMainExitTimestamp", "NextElapseUSecRealtime", "LastTriggerUSec"];

export function redact(value) {
  const input = String(value);
  if (/(?:authorization|bearer|password|secret|api[_-]?key|api[_-]?token|database_url|signature|credential|access[_-]?key|private[_-]?key|session[_-]?token)/i.test(input)) {
    return "[sensitive log omitted]";
  }
  return input
    .replace(/\b(Bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b((?:api[_-]?key|token|secret|password|authorization|database_url)\s*[=:]\s*)[^\s&"']+/gi, "$1[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .slice(0, 800);
}

export function parseProperties(output) {
  const parsed = {};
  for (const line of output.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    if (FIELDS.includes(key)) parsed[key] = line.slice(separator + 1).slice(0, 150);
  }
  return parsed;
}

function run(binary, args) {
  return execFileSync(binary, args, { encoding: "utf8", timeout: 4000, maxBuffer: 512 * 1024 });
}

function collectUnit(id) {
  let properties = {};
  let error = null;
  try {
    properties = parseProperties(run("/usr/bin/systemctl", ["show", id, "--no-pager", ...FIELDS.map(field => `--property=${field}`)]));
  } catch (reason) { error = redact(reason instanceof Error ? reason.message : reason); }
  const logs = [];
  if (id.startsWith("dota2notes-") || id === "dota2notes.service") {
    try {
      const output = run("/usr/bin/journalctl", ["--unit", id, "--since", "24 hours ago", "--lines", "35", "--output", "json", "--no-pager"]);
      for (const line of output.split("\n")) {
        if (!line) continue;
        try {
          const entry = JSON.parse(line);
          const timestamp = Number(entry.__REALTIME_TIMESTAMP);
          logs.push({ at: Number.isFinite(timestamp) ? new Date(timestamp / 1000).toISOString() : null,
            priority: /^[0-7]$/.test(String(entry.PRIORITY)) ? Number(entry.PRIORITY) : 6,
            message: redact(entry.MESSAGE ?? "") });
        } catch { /* Ignore malformed journal entries. */ }
      }
    } catch (reason) { error = redact(reason instanceof Error ? reason.message : reason); }
  }
  return { id, properties, logs, error };
}

export function collect() {
  return { version: 1, capturedAt: new Date().toISOString(), units: UNITS.map(collectUnit) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const directory = "/var/lib/dota2notes/monitor";
  const group = Number(process.env.MONITOR_GROUP_GID);
  if (!Number.isInteger(group) || group < 0) throw new Error("MONITOR_GROUP_GID must be the dota2notes group GID");
  mkdirSync(directory, { recursive: true, mode: 0o750 });
  chownSync(directory, 0, group);
  chmodSync(directory, 0o750);
  const target = `${directory}/status.json`;
  const temporary = `${directory}/.status-${randomUUID()}.json`;
  writeFileSync(temporary, JSON.stringify(collect()), { mode: 0o640, flag: "wx" });
  chownSync(temporary, 0, group);
  chmodSync(temporary, 0o640);
  renameSync(temporary, target);
}
