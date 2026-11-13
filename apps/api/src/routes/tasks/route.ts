import {and,desc,eq,or,sql} from "drizzle-orm";
import type {HttpRequest} from "../../http/protocol";
import {getRequestUser} from "../../lib/auth/request";
import {getDb} from "../../lib/db";
import {journalMatches,localReplayJobs,replayJobEvents} from "../../lib/db/schema";
import {progressFromRow} from "../../lib/replay/progress";
export async function GET(request:HttpRequest) {
  const user=await getRequestUser(request);if(!user)return Response.json({ok:false,error:{code:"unauthorized"}},{status:401});
  const db=getDb();
  const rows=await db.selectDistinct({updatedAt:localReplayJobs.updatedAt,requestStartedAt:localReplayJobs.requestStartedAt,matchId:localReplayJobs.matchId,status:localReplayJobs.status,intent:localReplayJobs.intent,
    phase:localReplayJobs.phase,downloadedBytes:localReplayJobs.downloadedBytes,totalBytes:localReplayJobs.totalBytes,downloadBps:localReplayJobs.downloadBps,
    attempts:localReplayJobs.attempts,runAfter:localReplayJobs.runAfter,phaseStartedAt:localReplayJobs.phaseStartedAt,heartbeatAt:localReplayJobs.heartbeatAt,
    retryDeadlineAt:localReplayJobs.retryDeadlineAt,errorCode:localReplayJobs.errorCode,requestedAt:localReplayJobs.requestStartedAt})
    .from(localReplayJobs).leftJoin(journalMatches,eq(journalMatches.dotaMatchId,localReplayJobs.matchId))
    .where(and(or(eq(localReplayJobs.requestedBy,user.id),eq(journalMatches.userId,user.id)),
      or(sql`${localReplayJobs.status} IN ('pending','processing')`,sql`${localReplayJobs.updatedAt}>now()-interval '1 day'`)))
    .orderBy(desc(localReplayJobs.requestStartedAt)).limit(100);
  // A queue position is a snapshot of the next claim order, not an ETA. Keep
  // this priority order aligned with claimLane in run-pipeline.mjs.
  const queued=rows.length?await db.execute(sql`WITH ranked AS (
    SELECT j.match_id,CASE WHEN j.phase='awaiting_parse' THEN 'parse' ELSE 'prepare' END AS lane,
      row_number() OVER (PARTITION BY (j.phase='awaiting_parse') ORDER BY CASE
        WHEN j.download_requested_at>now()-interval '30 minutes' AND
          (SELECT count(*) FROM (SELECT download_requested_at FROM local_replay_jobs WHERE dispatched_at IS NOT NULL ORDER BY dispatched_at DESC LIMIT 3) recent WHERE recent.download_requested_at>now()-interval '30 minutes')<3 THEN 0
        WHEN j.request_started_at<now()-interval '10 minutes' THEN 1
        WHEN j.download_requested_at>now()-interval '30 minutes' THEN 2 ELSE 3 END,
        served.last_dispatch NULLS FIRST,j.request_started_at,j.match_id)::int AS position
    FROM local_replay_jobs j LEFT JOIN (SELECT requested_by,max(dispatched_at) AS last_dispatch FROM local_replay_jobs GROUP BY requested_by) served
      ON served.requested_by IS NOT DISTINCT FROM j.requested_by
    WHERE j.status='pending' AND j.run_after<=now() AND (j.phase='awaiting_parse' OR j.retry_deadline_at>now())
  ), active AS (
    SELECT count(*) FILTER (WHERE phase='parsing')::int AS parse,
      count(*) FILTER (WHERE phase<>'parsing')::int AS prepare
    FROM local_replay_jobs WHERE status='processing' AND coalesce(heartbeat_at,locked_at)>now()-interval '2 minutes'
  ) SELECT ranked.match_id::text,ranked.lane,ranked.position,active.parse,active.prepare,now() AS observed_at
    FROM ranked CROSS JOIN active WHERE ranked.match_id IN (${sql.join(rows.map(row=>sql`${row.matchId}`),sql`,`)})`):{rows:[]};
  const positions=new Map(queued.rows.map(row=>[String(row.match_id),{
    lane:String(row.lane) as "prepare"|"parse",position:Number(row.position),
    activeCount:Number(row.lane==="parse"?row.parse:row.prepare),observedAt:new Date(String(row.observed_at)).toISOString(),
  }]));
  const [sample]=await db.select({seconds:sql<number|null>`avg(extract(epoch from (done.created_at-${replayJobEvents.createdAt})))::float`,count:sql<number>`count(*)::int`})
    .from(replayJobEvents).innerJoin(sql`replay_job_events done`,sql`done.match_id=${replayJobEvents.matchId} AND done.code='parse_complete'
      AND done.created_at>${replayJobEvents.createdAt} AND done.created_at<${replayJobEvents.createdAt}+interval '10 minutes'`)
    .where(and(eq(replayJobEvents.code,"parse_started"),sql`${replayJobEvents.createdAt}>now()-interval '7 days'`));
  return Response.json({ok:true,tasks:rows.map(row=>{
    const queue=row.status==='pending'&&row.phase!=='retry_wait'?positions.get(String(row.matchId)):null;
    return {matchId:String(row.matchId),kind:row.intent,status:row.status,requestedAt:row.requestStartedAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
      progress:progressFromRow(row),queueAhead:queue?queue.position-1:null,
      queuePosition:queue?.position??null,queueLane:queue?.lane??null,
      activeCount:queue?.activeCount??null,observedAt:queue?.observedAt??null,
      estimatedParseSeconds:sample?.count>=3&&sample.seconds!=null?Math.round(sample.seconds):null};
  })},{headers:{"Cache-Control":"private, no-store"}});
}
