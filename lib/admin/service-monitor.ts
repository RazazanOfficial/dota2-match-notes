import { readFile, stat } from "node:fs/promises";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

export type MonitorUnit = {
  id: string;
  properties: Record<string, string>;
  logs: { at: string | null; priority: number; message: string }[];
  error: string | null;
};

const snapshotPath = "/var/lib/dota2notes/monitor/status.json";
const ids = new Set([
  "dota2notes.service", "dota2notes-images.timer", "dota2notes-images.service",
  "dota2notes-opendota-parse.timer", "dota2notes-opendota-parse.service",
  "dota2notes-replay.timer", "dota2notes-replay.service",
  "dota2notes-performance-reference.timer", "dota2notes-performance-reference.service",
  "dota2notes-sync.timer", "dota2notes-sync.service", "dota2notes-stratz.timer",
  "dota2notes-stratz.service", "nginx.service", "postgresql.service",
]);

export function parseMonitorSnapshot(raw: string): { capturedAt: string; units: MonitorUnit[] } {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("invalid_monitor_snapshot");
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1 || typeof snapshot.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) || !Array.isArray(snapshot.units) || snapshot.units.length > ids.size) {
    throw new Error("invalid_monitor_snapshot");
  }
  const units = snapshot.units.map((entry): MonitorUnit => {
    if (!entry || typeof entry !== "object") throw new Error("invalid_monitor_snapshot");
    const unit = entry as Record<string, unknown>;
    if (typeof unit.id !== "string" || !ids.has(unit.id) ||
      !unit.properties || typeof unit.properties !== "object" || !Array.isArray(unit.logs) || unit.logs.length > 35) {
      throw new Error("invalid_monitor_snapshot");
    }
    const properties = Object.fromEntries(Object.entries(unit.properties).filter(([key, val]) =>
      /^[A-Za-z]{2,40}$/.test(key) && typeof val === "string" && val.length <= 150)) as Record<string, string>;
    const logs = unit.logs.map((item: unknown) => {
      if (!item || typeof item !== "object") throw new Error("invalid_monitor_snapshot");
      const log = item as Record<string, unknown>;
      if (typeof log.message !== "string" || log.message.length > 800 || typeof log.priority !== "number") throw new Error("invalid_monitor_snapshot");
      return { at: typeof log.at === "string" && Number.isFinite(Date.parse(log.at)) ? log.at : null,
        priority: Math.max(0, Math.min(7, Math.trunc(log.priority))), message: log.message };
    });
    return { id: unit.id, properties, logs, error: typeof unit.error === "string" ? unit.error.slice(0, 800) : null };
  });
  if (new Set(units.map(unit => unit.id)).size !== units.length) throw new Error("invalid_monitor_snapshot");
  return { capturedAt: snapshot.capturedAt, units };
}

export async function getServiceMonitor() {
  let snapshot: ReturnType<typeof parseMonitorSnapshot> | null = null;
  let snapshotError: string | null = null;
  try {
    const file = await stat(snapshotPath);
    if (file.size > 512 * 1024) throw new Error("snapshot_too_large");
    snapshot = parseMonitorSnapshot(await readFile(snapshotPath, "utf8"));
  } catch (error) {
    snapshotError = error instanceof Error && "code" in error && error.code === "ENOENT"
      ? "مانیتور روی VPS هنوز نصب یا اجرا نشده است" : "خواندن گزارش سرویس‌ها ممکن نیست";
  }

  const rows = await getDb().execute(sql`
    SELECT source, status, count(*)::integer AS total FROM (
      SELECT 'replay' AS source, status::text FROM local_replay_jobs
      UNION ALL SELECT 'images', status::text FROM match_image_jobs
      UNION ALL SELECT 'opendota_parse', status::text FROM open_dota_parse_jobs
      UNION ALL SELECT 'sync', status::text FROM sync_jobs
    ) jobs GROUP BY source, status ORDER BY source, status
  `);
  const latest = await getDb().execute(sql`
    SELECT source, status, detail, updated_at FROM (
      SELECT 'replay' AS source, status::text, coalesce(error_code, '') AS detail, updated_at FROM local_replay_jobs WHERE status = 'failed'
      UNION ALL SELECT 'images', status::text, coalesce(error_code, ''), updated_at FROM match_image_jobs WHERE status = 'failed'
      UNION ALL SELECT 'opendota_parse', status::text, coalesce(error_code, ''), updated_at FROM open_dota_parse_jobs WHERE status = 'failed'
    ) failures ORDER BY updated_at DESC LIMIT 8
  `);
  return {
    ...snapshot, snapshotError,
    stale: snapshot ? Date.now() - Date.parse(snapshot.capturedAt) > 180_000 : true,
    queues: rows.rows.map(row => ({ source: String(row.source), status: String(row.status), total: Number(row.total) })),
    failures: latest.rows.map(row => ({ source: String(row.source), at: String(row.updated_at), detail: String(row.detail).slice(0, 250) })),
  };
}
