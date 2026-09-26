import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dotaMatches, journalMatches, localReplayJobs } from "@/lib/db/schema";
import { REPLAY_REQUEST_MAX_AGE_DAYS } from "@/lib/opendota/analysis-policy";
import { replayObjectHead } from "./archive-storage";

export type ReplayIntent = "download" | "analysis";

export async function getReplayJobState(journalMatchId: string) {
  const [row] = await getDb().select({
    startedAt: journalMatches.startedAt,
    status: localReplayJobs.status,
    intent: localReplayJobs.intent,
    errorCode: localReplayJobs.errorCode,
    archiveKey: localReplayJobs.archiveKey,
    archiveStatus: localReplayJobs.archiveStatus,
  }).from(journalMatches)
    .leftJoin(localReplayJobs, eq(journalMatches.dotaMatchId, localReplayJobs.matchId))
    .where(eq(journalMatches.id, journalMatchId)).limit(1);
  if (!row) return null;
  return {
    status: row.status === "completed" && row.intent === "download" ? "basic" :
      row.status || (!row.archiveKey && row.startedAt &&
        Date.now() - row.startedAt.getTime() > REPLAY_REQUEST_MAX_AGE_DAYS * 86_400_000 ? "expired" : "basic"),
    errorCode: row.errorCode,
    archived: Boolean(row.archiveKey && row.archiveStatus === "active"),
  };
}

export async function getReplayArchive(matchId: number) {
  const [row] = await getDb().select({
    key: localReplayJobs.archiveKey,
    status: localReplayJobs.archiveStatus,
    bytes: localReplayJobs.archiveBytes,
  }).from(localReplayJobs).where(eq(localReplayJobs.matchId, matchId)).limit(1);
  if (!row?.key || row.status !== "active") return null;
  const head = await replayObjectHead(row.key);
  if (!head || head.bytes !== row.bytes || !head.sha256) {
    await getDb().update(localReplayJobs).set({ archiveStatus: "missing", updatedAt: new Date() })
      .where(and(eq(localReplayJobs.matchId, matchId), eq(localReplayJobs.archiveKey, row.key), eq(localReplayJobs.archiveStatus, "active")));
    return null;
  }
  return { key: row.key, bytes: head.bytes };
}

export async function requestReplayJob(journalMatchId: string, userId: string, intent: ReplayIntent) {
  const [owned] = await getDb().select({ matchId: journalMatches.dotaMatchId })
    .from(journalMatches).where(and(eq(journalMatches.id, journalMatchId), eq(journalMatches.userId, userId))).limit(1);
  if (!owned?.matchId) return "not_found" as const;
  return requestReplayByDotaId(owned.matchId, intent);
}

// Standalone match requests use the same global job, without creating a journal entry.
export async function requestReplayByDotaId(matchId: number, intent: ReplayIntent) {
  const db = getDb();
  const [match] = await db.select({
    startedAt: dotaMatches.startedAt,
    rawData: dotaMatches.rawData,
    localReplayData: dotaMatches.localReplayData,
    archiveKey: localReplayJobs.archiveKey,
    archiveStatus: localReplayJobs.archiveStatus,
    jobStatus: localReplayJobs.status,
  }).from(dotaMatches)
    .leftJoin(localReplayJobs, eq(dotaMatches.matchId, localReplayJobs.matchId))
    .where(eq(dotaMatches.matchId, matchId)).limit(1);
  if (!match?.rawData) return "not_found" as const;
  const parsed = match.localReplayData?.match_id === matchId &&
    Array.isArray(match.localReplayData.players) && match.localReplayData.players.length === 10;
  let hasArchive = false;
  if (match.archiveKey && match.archiveStatus === "active") {
    hasArchive = Boolean(await getReplayArchive(matchId));
    if (hasArchive && (intent === "download" || parsed)) return "ready" as const;
  }
  if (intent === "analysis" && parsed) return "ready" as const;
  if ((!match.startedAt || Date.now() - match.startedAt.getTime() > REPLAY_REQUEST_MAX_AGE_DAYS * 86_400_000) &&
      !hasArchive) return "expired" as const;
  const now = new Date();
  const [queued] = await db.insert(localReplayJobs).values({
    matchId, intent, runAfter: now, updatedAt: now,
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

export async function replayStatusForMatch(matchId: number) {
  const [row] = await getDb().select({
    status: localReplayJobs.status, intent: localReplayJobs.intent, errorCode: localReplayJobs.errorCode,
    archiveStatus: localReplayJobs.archiveStatus,
  }).from(localReplayJobs).where(eq(localReplayJobs.matchId, matchId)).limit(1);
  if (!row) return { status: "basic", archived: false, errorCode: null };
  // A completed analysis job may still have a downloadable archive.
  const archived = row.archiveStatus === "active" && Boolean(await getReplayArchive(matchId));
  return { status: row.status === "completed" && row.intent === "download" ? "basic" : row.status, archived, errorCode: row.errorCode };
}
