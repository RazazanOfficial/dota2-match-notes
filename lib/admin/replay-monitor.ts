import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
export async function getReplayMonitor(matchId?: number) {
  const db = getDb();
  const [jobs, routes, events, totals] = await Promise.all([
    db.execute(sql`SELECT match_id::text,status,intent,phase,attempts,downloaded_bytes::text,total_bytes::text,
      download_bps,transfer_bytes::text,upload_bytes::text,archive_status,spool_complete,error_code,error_message,
      last_endpoint,last_address,heartbeat_at,phase_started_at,run_after,retry_deadline_at
      FROM local_replay_jobs ORDER BY (status IN ('pending','processing')) DESC,updated_at DESC LIMIT 50`),
    db.execute(sql`SELECT endpoint,address,failures,open_until,last_success_at,last_error_code FROM replay_transport_routes ORDER BY updated_at DESC LIMIT 24`),
    db.execute(sql`SELECT match_id::text,phase,code,detail,endpoint,address,created_at,http_status FROM replay_job_events
      ${matchId ? sql`WHERE match_id=${matchId}` : sql``} ORDER BY created_at DESC LIMIT 100`),
    db.execute(sql`SELECT status,count(*)::text AS count,sum(transfer_bytes)::text AS transfer_bytes,sum(upload_bytes)::text AS upload_bytes
      FROM local_replay_jobs GROUP BY status`),
  ]);
  return { capturedAt: new Date().toISOString(), jobs: jobs.rows, routes: routes.rows, events: events.rows, totals: totals.rows };
}
