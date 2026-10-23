import {and,desc,eq,or,sql} from "drizzle-orm";
import type {HttpRequest} from "../../http/protocol";
import {getRequestUser} from "../../lib/auth/request";
import {getDb} from "../../lib/db";
import {journalMatches,localReplayJobs,replayJobEvents} from "../../lib/db/schema";
import {progressFromRow} from "../../lib/replay/progress";
export async function GET(request:HttpRequest) {
  const user=await getRequestUser(request);if(!user)return Response.json({ok:false,error:{code:"unauthorized"}},{status:401});
  const db=getDb();
  const rows=await db.selectDistinct({matchId:localReplayJobs.matchId,status:localReplayJobs.status,intent:localReplayJobs.intent,
    phase:localReplayJobs.phase,downloadedBytes:localReplayJobs.downloadedBytes,totalBytes:localReplayJobs.totalBytes,downloadBps:localReplayJobs.downloadBps,
    attempts:localReplayJobs.attempts,runAfter:localReplayJobs.runAfter,phaseStartedAt:localReplayJobs.phaseStartedAt,heartbeatAt:localReplayJobs.heartbeatAt,
    retryDeadlineAt:localReplayJobs.retryDeadlineAt,errorCode:localReplayJobs.errorCode,requestedAt:localReplayJobs.requestStartedAt})
    .from(localReplayJobs).leftJoin(journalMatches,eq(journalMatches.dotaMatchId,localReplayJobs.matchId))
    .where(and(or(eq(localReplayJobs.requestedBy,user.id),eq(journalMatches.userId,user.id)),
      or(sql`${localReplayJobs.status} IN ('pending','processing')`,sql`${localReplayJobs.updatedAt}>now()-interval '1 day'`)))
    .orderBy(desc(localReplayJobs.requestStartedAt)).limit(100);
  const queued=await db.execute(sql`SELECT j.match_id::text,
    (row_number() OVER(PARTITION BY (j.phase='awaiting_parse') ORDER BY served.last_dispatch NULLS FIRST,j.request_started_at,j.match_id)-1)::int AS ahead
    FROM local_replay_jobs j LEFT JOIN (SELECT requested_by,max(dispatched_at) AS last_dispatch FROM local_replay_jobs GROUP BY requested_by) served
      ON served.requested_by IS NOT DISTINCT FROM j.requested_by
    WHERE j.status='pending' AND j.run_after<=now() AND j.retry_deadline_at>now()`);
  const positions=new Map(queued.rows.map(row=>[String(row.match_id),Number(row.ahead)]));
  const [sample]=await db.select({seconds:sql<number|null>`avg(extract(epoch from (done.created_at-${replayJobEvents.createdAt})))::float`,count:sql<number>`count(*)::int`})
    .from(replayJobEvents).innerJoin(sql`replay_job_events done`,sql`done.match_id=${replayJobEvents.matchId} AND done.code='parse_complete'
      AND done.created_at>${replayJobEvents.createdAt} AND done.created_at<${replayJobEvents.createdAt}+interval '10 minutes'`)
    .where(and(eq(replayJobEvents.code,"parse_started"),sql`${replayJobEvents.createdAt}>now()-interval '7 days'`));
  return Response.json({ok:true,tasks:rows.map(row=>({matchId:String(row.matchId),kind:row.intent,status:row.status,requestedAt:row.requestedAt.toISOString(),
    progress:progressFromRow(row),queueAhead:row.status==='pending'&&row.phase!=='retry_wait'?positions.get(String(row.matchId))??null:null,
    estimatedParseSeconds:sample?.count>=3&&sample.seconds!=null?Math.round(sample.seconds):null}))},{headers:{"Cache-Control":"private, no-store"}});
}
