import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dotaMatches, journalMatches, localReplayJobs } from "@/lib/db/schema";
import { REPLAY_REQUEST_MAX_AGE_DAYS } from "@/lib/opendota/analysis-policy";

export type ReplayIntent = "download" | "analysis";

export async function getReplayJobState(journalMatchId: string) {
  const [row] = await getDb().select({
    startedAt: journalMatches.startedAt,
    status: localReplayJobs.status,
    intent: localReplayJobs.intent,
    errorCode: localReplayJobs.errorCode,
    archiveKey: localReplayJobs.archiveKey,
  }).from(journalMatches)
    .leftJoin(localReplayJobs, eq(journalMatches.dotaMatchId, localReplayJobs.matchId))
    .where(eq(journalMatches.id, journalMatchId)).limit(1);
  if (!row) return null;
  return {
    status: row.status === "completed" && row.intent === "download" ? "basic" :
      row.status || (!row.archiveKey && row.startedAt &&
        Date.now() - row.startedAt.getTime() > REPLAY_REQUEST_MAX_AGE_DAYS * 86_400_000 ? "expired" : "basic"),
    errorCode: row.errorCode,
    archived: Boolean(row.archiveKey),
  };
}

export async function requestReplayJob(journalMatchId: string, userId: string, intent: ReplayIntent) {
  const db = getDb();
  const [match] = await db.select({
    ownerId: journalMatches.userId,
    matchId: journalMatches.dotaMatchId,
    startedAt: journalMatches.startedAt,
    rawData: dotaMatches.rawData,
    localReplayData: dotaMatches.localReplayData,
    archiveKey: localReplayJobs.archiveKey,
    jobStatus: localReplayJobs.status,
  }).from(journalMatches)
    .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .leftJoin(localReplayJobs, eq(journalMatches.dotaMatchId, localReplayJobs.matchId))
    .where(eq(journalMatches.id, journalMatchId)).limit(1);
  if (!match || match.ownerId !== userId || !match.matchId || !match.rawData) return "not_found" as const;
  const parsed = match.localReplayData?.match_id === match.matchId &&
    Array.isArray(match.localReplayData.players) && match.localReplayData.players.length === 10;
  if (match.archiveKey && (intent === "download" || parsed)) return "ready" as const;
  if (!match.archiveKey && !parsed && (!match.startedAt ||
      Date.now() - match.startedAt.getTime() > REPLAY_REQUEST_MAX_AGE_DAYS * 86_400_000)) return "expired" as const;
  const now = new Date();
  const [queued] = await db.insert(localReplayJobs).values({
    matchId: match.matchId, intent, runAfter: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: localReplayJobs.matchId,
    set: {
      intent: sql`CASE WHEN ${localReplayJobs.status} IN ('pending','processing')
        AND ${localReplayJobs.intent} = 'analysis' THEN 'analysis' ELSE ${intent} END`,
      status: sql`CASE WHEN ${localReplayJobs.status} = 'processing' THEN 'processing' ELSE 'pending' END`,
      attempts: sql`CASE WHEN ${localReplayJobs.status} = 'processing' THEN ${localReplayJobs.attempts} ELSE 0 END`,
      runAfter: now,
      lockedAt: sql`CASE WHEN ${localReplayJobs.status} = 'processing' THEN ${localReplayJobs.lockedAt} ELSE NULL END`,
      finishedAt: null, errorCode: null, errorMessage: null, updatedAt: now,
    },
    setWhere: sql`${localReplayJobs.status} IN ('completed','failed','waiting_file') OR
      (${localReplayJobs.status} IN ('pending','processing') AND ${localReplayJobs.intent} = 'download' AND ${intent} = 'analysis')`,
  }).returning({ matchId: localReplayJobs.matchId });
  return queued && match.jobStatus !== "pending" && match.jobStatus !== "processing" ? "queued" as const : "already_queued" as const;
}
