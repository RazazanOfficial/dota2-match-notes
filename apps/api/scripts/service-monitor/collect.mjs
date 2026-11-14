import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync, chmodSync, chownSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Installed as a root-owned file outside the application checkout. No request input
// is ever passed to systemctl or journalctl.
export const APP_UNITS = Object.freeze([
  "dota2notes.service", "dota2notes-api.service", "nginx.service", "postgresql.service",
  "dota2notes-monitor.timer", "dota2notes-monitor.service",
]);
export const COMPUTE_UNITS = Object.freeze([
  "dota2notes-link.service", "dota2notes-sync-daemon.service", "dota2notes-api.service",
  "dota2notes-replay.service", "dota2notes-images.timer", "dota2notes-images.service",
  "dota2notes-performance-reference.timer", "dota2notes-performance-reference.service",
  "dota2notes-monitor.timer", "dota2notes-monitor.service",
]);
export const UNITS = Object.freeze([...new Set([...APP_UNITS, ...COMPUTE_UNITS])]);
const FIELDS = ["Id", "LoadState", "UnitFileState", "ActiveState", "SubState", "Result", "ExecMainStatus", "ActiveEnterTimestamp", "InactiveEnterTimestamp", "ExecMainStartTimestamp", "ExecMainExitTimestamp", "NextElapseUSecRealtime", "NextElapseUSecMonotonic", "LastTriggerUSec", "Unit", "TimersCalendar", "TimersMonotonic", "AccuracyUSec", "RandomizedDelayUSec"];

export function durationSeconds(value) {
  if (!value || value === "infinity") return null;
  if (value === "0") return 0;
  // systemctl show formats usec properties as timespans, e.g. "1min 10s".
  const units = { us: 0.000001, "µs": 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, w: 604800 };
  let total = 0, consumed = "";
  for (const match of value.matchAll(/([\d.]+)\s*(us|µs|ms|min|s|h|d|w)/g)) {
    total += Number(match[1]) * units[match[2]];
    consumed += match[0];
  }
  return consumed && consumed.replace(/\s/g, "") === value.replace(/\s/g, "") ? total : null;
}

export function timerTimestamp(value) {
  const micros = Number(value);
  if (!Number.isFinite(micros) || micros <= 0 || micros >= 8.64e18) return null;
  return new Date(micros / 1000).toISOString();
}

// On Linux, process.hrtime and systemd monotonic deadlines use CLOCK_MONOTONIC.
// Convert the actual deadline, rather than guessing a new interval from now.
export function monotonicTimestamp(value, now = Date.now(), clockSeconds = Number(process.hrtime.bigint()) / 1e9) {
  const deadline = durationSeconds(value);
  if (deadline === null || deadline <= 0) return null;
  const timestamp = now + (deadline - clockSeconds) * 1000;
  return Number.isFinite(timestamp) && Math.abs(timestamp) < 8.64e15 ? new Date(timestamp).toISOString() : null;
}

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
  return execFileSync(binary, args, { encoding: "utf8", timeout: 4000, maxBuffer: 512 * 1024, env: { ...process.env, LC_ALL: "C", TZ: "UTC" } });
}

function collectUnit(id, timers) {
  let properties = {};
  let error = null;
  try {
    properties = parseProperties(run("/usr/bin/systemctl", ["show", id, "--no-pager", ...FIELDS.map(field => `--property=${field}`)]));
  } catch (reason) { error = redact(reason instanceof Error ? reason.message : reason); }
  for (const key of ["ActiveEnterTimestamp", "InactiveEnterTimestamp", "ExecMainStartTimestamp", "ExecMainExitTimestamp", "LastTriggerUSec", "NextElapseUSecRealtime"]) {
    const value = properties[key];
    if (value && Number.isFinite(Date.parse(value))) properties[key] = new Date(value).toISOString();
  }
  properties.ExpectedActive = "yes";
  if (id.endsWith(".timer")) {
    properties.TargetUnit = properties.Unit || id.replace(/\.timer$/, ".service");
    properties.Schedule = [properties.TimersCalendar, properties.TimersMonotonic].filter(Boolean).join(" · ").slice(0, 150);
    const next = timerTimestamp(timers.find(timer => timer.unit === id)?.next);
    if (next) properties.NextRunAt = next;
    else if (properties.NextElapseUSecRealtime && Number.isFinite(Date.parse(properties.NextElapseUSecRealtime))) {
      properties.NextRunAt = new Date(properties.NextElapseUSecRealtime).toISOString();
    }
    else {
      const monotonic = monotonicTimestamp(properties.NextElapseUSecMonotonic);
      if (monotonic) properties.NextRunAt = monotonic;
    }
    const accuracy = durationSeconds(properties.AccuracyUSec);
    const randomDelay = durationSeconds(properties.RandomizedDelayUSec);
    if (accuracy !== null) properties.TimerAccuracySec = String(accuracy + (randomDelay ?? 0));
  }
  if (id === "dota2notes-performance-reference.timer" && properties.UnitFileState === "disabled" && properties.ActiveState === "inactive") properties.ExpectedActive = "no";
  const logs = [];
  if (UNITS.includes(id)) {
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
  // Bound serialized bytes too: non-ASCII/escaped messages can be much larger
  // than their character count. Keep the newest logs within the snapshot cap.
  let logBytes = logs.reduce((sum, log) => sum + Buffer.byteLength(JSON.stringify(log)) + 1, 0);
  while (logBytes > 32 * 1024 && logs.length) logBytes -= Buffer.byteLength(JSON.stringify(logs.shift())) + 1;
  return { id, properties, logs, error };
}

export function collect() {
  const role = process.env.MONITOR_NODE_ROLE;
  if (!["app", "compute"].includes(role)) throw new Error("MONITOR_NODE_ROLE must be app or compute");
  let timers = [];
  try {
    const parsed = JSON.parse(run("/usr/bin/systemctl", ["list-timers", "--all", "--output=json", "--no-pager"]));
    if (Array.isArray(parsed)) timers = parsed;
  } catch { /* Older systemd: realtime timestamps remain available; never invent a countdown. */ }
  const units = (role === "app" ? APP_UNITS : COMPUTE_UNITS).map(id => collectUnit(id, timers));
  const referenceTimer = units.find(unit => unit.id === "dota2notes-performance-reference.timer");
  const reference = units.find(unit => unit.id === "dota2notes-performance-reference.service");
  if (reference && referenceTimer?.properties.ExpectedActive === "no") reference.properties.ExpectedActive = "no";
  return { version: 2, role, capturedAt: new Date().toISOString(), units };
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
