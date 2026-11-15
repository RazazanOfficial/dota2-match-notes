import type { Messages } from "./i18n";
import { isPersian } from "./i18n";
import { unitState, type MonitorHost, type MonitorUnit, type ServiceMonitor } from "./admin";

export const logLevels = ["info", "warning", "success", "error"] as const;
export type LogLevel = typeof logLevels[number];
type MonitorLog = MonitorUnit["logs"][number];
const eventLevels: Record<string, LogLevel> = {
  archive_stopped: "error", replay_pipeline_failed: "error", replay_worker_failed: "error", replay_transport_failure: "error",
  archive_retry_scheduled: "warning", metadata_direct_failed: "warning", checkpoint_discarded: "warning", lane_events_unavailable: "warning",
  archive_complete: "success", job_complete: "success", parse_complete: "success",
};

export function monitorDate(value: string | null | undefined, t: Messages) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(isPersian(t) ? "fa-IR-u-nu-latn" : "en-GB", {
    timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short", hourCycle: "h23", numberingSystem: "latn",
  }).format(date) : "—";
}

// Journald priority is authoritative for failures. Structured stdout can carry a
// stronger application-level result; HTTP 200 / ok:true alone is not job success.
export function logLevel(log: MonitorLog): LogLevel {
  const levels = new Set<LogLevel>();
  if (log.priority <= 3) levels.add("error");
  else if (log.priority === 4) levels.add("warning");
  const meaningful = (value: unknown): boolean => value !== null && value !== undefined && value !== false && value !== 0 && value !== "" && value !== "0" && value !== "false" && (Array.isArray(value) ? value.some(meaningful) : typeof value === "object" ? Object.values(value).some(meaningful) : true);
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8) return;
    for (const [key, item] of Object.entries(value)) {
      if (/^(error|errors|error_code|errorCode|failed|failures)$/.test(key) && meaningful(item)) levels.add("error");
      if (/^(level|severity|status|result|name)$/.test(key) && typeof item === "string") {
        if (/^(error|fatal|critical|failed|failure|[\w.]*Error)$/i.test(item)) levels.add("error");
        if (/^(warn|warning)$/i.test(item)) levels.add("warning");
        if (/^(success|succeeded|completed)$/i.test(item)) levels.add("success");
      }
      if (key === "success" && item === true) levels.add("success");
      if (key === "code" && typeof item === "string" && Object.hasOwn(eventLevels, item)) levels.add(eventLevels[item]);
      if (key === "phase" && item === "failed") levels.add("error");
      visit(item, depth + 1);
    }
  };
  try { visit(JSON.parse(log.message)); } catch {
    if (/^(?:\[[^\]]+\]\s*)?(?:[\w.]*Error\b|ERROR\b|FATAL\b|Failed\b)/i.test(log.message.trim()) || /:\s*(?:Failed with result|Main process exited,.*status=[1-9])/i.test(log.message)) levels.add("error");
    else if (/^(?:\[[^\]]+\]\s*)?(?:WARN(?:ING)?\b)/i.test(log.message.trim())) levels.add("warning");
    else if (/^(?:SUCCESS\b|Successfully\b)|\bcompleted successfully[.!]?$/i.test(log.message.trim())) levels.add("success");
  }
  return levels.has("error") ? "error" : levels.has("warning") ? "warning" : levels.has("success") ? "success" : "info";
}

export function structuredValue(value: string): { text: string; json: boolean } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object") return { text: JSON.stringify(parsed, null, 2), json: true };
  } catch { /* Preserve systemd syntax and truncated journal messages verbatim. */ }
  return { text: value, json: false };
}

export interface MonitorError {
  hostId: MonitorHost["id"] | null;
  unitId: string;
  source: "journal" | "snapshot" | "state" | "queue";
  at: string | null;
  reason: string;
}
export const queueUnits: Record<string, string> = {
  replay: "dota2notes-replay.service", replay_archive: "dota2notes-replay.service",
  images: "dota2notes-images.service", sync: "dota2notes-sync-daemon.service",
};

export function latestMonitorErrors(hosts: MonitorHost[], failures: ServiceMonitor["failures"], now: number): MonitorError[] {
  const errors: MonitorError[] = [];
  for (const host of hosts) {
    for (const unit of host.units) {
      const logs = unit.logs.filter(log => logLevel(log) === "error");
      for (const log of logs) errors.push({ hostId: host.id, unitId: unit.id, at: log.at, reason: log.message, source: "journal" });
      if (unit.error) errors.push({ hostId: host.id, unitId: unit.id, at: null, reason: unit.error, source: "snapshot" });
      const target = host.units.find(candidate => candidate.id === (unit.properties.TargetUnit || unit.id.replace(/\.timer$/, ".service")));
      const state = unitState(unit, { now, stale: host.stale, target });
      if (!logs.length && (state === "failed" || state === "stopped")) errors.push({
        hostId: host.id, unitId: unit.id, source: "state",
        at: unit.properties.ExecMainExitTimestamp || unit.properties.InactiveEnterTimestamp || null,
        reason: [state, unit.properties.Result, unit.properties.ExecMainStatus ? `Exit ${unit.properties.ExecMainStatus}` : ""].filter(Boolean).join(" · "),
      });
    }
  }
  for (const failure of failures) errors.push({
    // These queues are claimed by compute workers in the two-VPS contract.
    hostId: queueUnits[failure.source] ? "germany" : null,
    unitId: queueUnits[failure.source] || failure.source, source: "queue", at: failure.at, reason: failure.detail,
  });
  const seen = new Set<string>();
  return errors.filter(error => {
    const key = JSON.stringify([error.hostId, error.unitId, error.at, error.reason, error.source]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0)).slice(0, 40);
}
