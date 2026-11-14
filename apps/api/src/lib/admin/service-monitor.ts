import { readFile, stat } from "node:fs/promises";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { COMPUTE_HEADER, getTopology } from "../../runtime/topology";

export type MonitorUnit = {
  id: string;
  properties: Record<string, string>;
  logs: { at: string | null; priority: number; message: string }[];
  error: string | null;
};

const snapshotPath = "/var/lib/dota2notes/monitor/status.json";
export const monitorUnits = {
  app: ["dota2notes.service", "dota2notes-api.service", "nginx.service", "postgresql.service", "dota2notes-monitor.timer", "dota2notes-monitor.service"],
  compute: ["dota2notes-link.service", "dota2notes-sync-daemon.service", "dota2notes-api.service", "dota2notes-replay.service", "dota2notes-images.timer", "dota2notes-images.service", "dota2notes-performance-reference.timer", "dota2notes-performance-reference.service", "dota2notes-monitor.timer", "dota2notes-monitor.service"],
} as const;
const ids = new Set<string>([...monitorUnits.app, ...monitorUnits.compute]);
type MonitorRole = keyof typeof monitorUnits;
export type MonitorHost = { id: "iran" | "germany"; label: string; capturedAt: string | null; stale: boolean; snapshotError: string | null; units: MonitorUnit[] };

export function parseMonitorSnapshot(raw: string): { capturedAt: string; role: MonitorRole | null; units: MonitorUnit[] } {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("invalid_monitor_snapshot");
  const snapshot = value as Record<string, unknown>;
  if ((snapshot.version !== 1 && snapshot.version !== 2) || typeof snapshot.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) || Date.parse(snapshot.capturedAt) > Date.now() + 300_000 || !Array.isArray(snapshot.units) || snapshot.units.length > ids.size ||
    (snapshot.version === 2 && snapshot.role !== "app" && snapshot.role !== "compute")) {
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
  const role = snapshot.role === "app" || snapshot.role === "compute" ? snapshot.role : null;
  if (role && units.some(unit => !(monitorUnits[role] as readonly string[]).includes(unit.id))) throw new Error("invalid_monitor_host");
  return { capturedAt: snapshot.capturedAt, role, units };
}

async function localHost(role: MonitorRole): Promise<MonitorHost> {
  let snapshot: ReturnType<typeof parseMonitorSnapshot> | null = null;
  let snapshotError: string | null = null;
  try {
    const file = await stat(snapshotPath);
    if (file.size > 512 * 1024) throw new Error("snapshot_too_large");
    snapshot = parseMonitorSnapshot(await readFile(snapshotPath, "utf8"));
    if (snapshot.role !== role) throw new Error("monitor_role_mismatch");
    if (snapshot.units.length !== monitorUnits[role].length) throw new Error("monitor_incomplete");
  } catch (error) {
    snapshot = null;
    snapshotError = error instanceof Error && "code" in error && error.code === "ENOENT"
      ? "مانیتور روی VPS هنوز نصب یا اجرا نشده است" : "خواندن گزارش سرویس‌ها ممکن نیست";
  }
  return { id: role === "app" ? "iran" : "germany", label: role === "app" ? "Iran VPS" : "Germany VPS",
    capturedAt: snapshot?.capturedAt ?? null, units: snapshot?.units ?? [], snapshotError,
    stale: !snapshot || Date.now() - Date.parse(snapshot.capturedAt) > 180_000 };
}

async function computeHost(headers?: Headers): Promise<MonitorHost> {
  const unavailable: MonitorHost = { id: "germany", label: "Germany VPS", capturedAt: null, stale: true, units: [], snapshotError: "گزارش آلمان از مسیر خصوصی دریافت نشد" };
  try {
    const config = getTopology();
    const forwarded = new Headers({ [COMPUTE_HEADER]: config.computeToken });
    for (const name of ["cookie", "authorization"]) {
      const value = headers?.get(name);
      if (value) forwarded.set(name, value);
    }
    const response = await fetch(`${config.computeOrigin}/api/admin/service-monitor`, {
      headers: forwarded, signal: AbortSignal.timeout(Math.min(config.timeoutMs, 8_000)), redirect: "error",
    });
    if (!response.ok || !response.body) return unavailable;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 512 * 1024) { await reader.cancel(); return unavailable; }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const host = body?.monitor?.hosts?.find((entry: { id?: string }) => entry?.id === "germany");
    if (!host) return unavailable;
    if (!host.capturedAt) return { ...unavailable, snapshotError: "مانیتور آلمان هنوز گزارش معتبر ندارد" };
    const snapshot = parseMonitorSnapshot(JSON.stringify({ version: 2, role: "compute", capturedAt: host.capturedAt, units: host.units }));
    if (snapshot.units.length !== monitorUnits.compute.length) return unavailable;
    return { ...unavailable, snapshotError: null, capturedAt: snapshot.capturedAt, units: snapshot.units,
      stale: Date.now() - Date.parse(snapshot.capturedAt) > 180_000 };
  } catch { return unavailable; }
}

export async function getServiceMonitor(headers?: Headers) {
  const role = getTopology().role;
  const hosts = await Promise.all(role === "app" ? [localHost("app"), computeHost(headers)] : [localHost("compute")]);
  // The private response contains only its own snapshot, once. Shared queues are
  // read by Iran; duplicating units can exceed the bounded bridge response.
  if (role === "compute") {
    return { hosts, capturedAt: hosts[0].capturedAt, units: [] as MonitorUnit[],
      snapshotError: hosts[0].snapshotError, stale: hosts[0].stale,
      stages: [], queues: [], failures: [] };
  }

  const rows = await getDb().execute(sql`
    SELECT source, status, count(*)::integer AS total FROM (
      SELECT 'replay' AS source, status::text FROM local_replay_jobs
      UNION ALL SELECT 'replay_archive', status::text FROM replay_archive_jobs
      UNION ALL SELECT 'images', status::text FROM match_image_jobs
      UNION ALL SELECT 'sync', status::text FROM sync_jobs
    ) jobs GROUP BY source, status ORDER BY source, status
  `);
  const latest = await getDb().execute(sql`
    SELECT source, status, detail, updated_at FROM (
      SELECT 'replay' AS source, status::text, coalesce(error_code, '') AS detail, updated_at FROM local_replay_jobs WHERE status = 'failed'
      UNION ALL SELECT 'replay_archive', status::text, coalesce(error_code, ''), updated_at FROM replay_archive_jobs WHERE error_code IS NOT NULL
      UNION ALL SELECT 'images', status::text, coalesce(error_code, ''), updated_at FROM match_image_jobs WHERE status = 'failed'
      UNION ALL SELECT 'sync', status::text, coalesce(error_message, ''), coalesce(finished_at, created_at) FROM sync_jobs WHERE status = 'failed'
    ) failures ORDER BY updated_at DESC LIMIT 8
  `);
  const stages = await getDb().execute(sql`
    SELECT CASE WHEN phase IN ('parsing','awaiting_parse') THEN 'parse' ELSE 'prepare' END AS id,
      count(*) FILTER (WHERE status='processing' AND coalesce(heartbeat_at,locked_at)>now()-interval '2 minutes')::integer AS active,
      count(*) FILTER (WHERE status='pending')::integer AS pending
    FROM local_replay_jobs WHERE status IN ('pending','processing') GROUP BY 1
    UNION ALL SELECT 'archive',
      count(*) FILTER (WHERE status='processing' AND coalesce(heartbeat_at,locked_at)>now()-interval '2 minutes')::integer,
      count(*) FILTER (WHERE status='pending')::integer FROM replay_archive_jobs
  `);
  return {
    hosts, capturedAt: hosts[0]?.capturedAt ?? null, units: hosts.flatMap(host => host.units),
    snapshotError: hosts.map(host => host.snapshotError).filter(Boolean).join("؛ ") || null,
    stale: hosts.some(host => host.stale),
    stages: ["prepare", "parse", "archive"].map(id => {
      const row = stages.rows.find(entry => entry.id === id);
      return { id, active: Number(row?.active ?? 0), pending: Number(row?.pending ?? 0),
        failed: id === "archive" ? Number(rows.rows.find(entry => entry.source === "replay_archive" && entry.status === "failed")?.total ?? 0) : null };
    }),
    queues: rows.rows.map(row => ({ source: String(row.source), status: String(row.status), total: Number(row.total) })),
    failures: latest.rows.map(row => ({ source: String(row.source), at: String(row.updated_at), detail: String(row.detail).slice(0, 250) })),
  };
}
