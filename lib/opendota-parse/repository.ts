import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dotaMatches, journalDays, journalMatches, matchImageJobs, openDotaParseJobs, users } from "@/lib/db/schema";
import { ANALYSIS_TOKEN_COST, matchAnalysisStatus } from "@/lib/opendota/analysis-policy";
import { hasParsedOpenDotaReplay } from "@/lib/opendota/validation";
import { matchesSyncGameMode } from "@/lib/opendota/sync-request";
import type { MatchSyncGameMode } from "@/lib/types";
import type { OpenDotaParseConfig } from "./config";

export interface ClaimedOpenDotaParseJob {
  id: string;
  matchId: string;
  dotaMatchId: number;
  providerJobId: string | null;
  attempts: number;
  pollAttempts: number;
  lockedAt: Date;
}

export async function getOpenDotaAnalysisState(matchId: string) {
  const [source] = await getDb().select({
    startedAt: journalMatches.startedAt,
    rawData: dotaMatches.rawData,
    parseStatus: openDotaParseJobs.status,
    errorCode: openDotaParseJobs.errorCode,
  })
    .from(journalMatches)
    .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .leftJoin(openDotaParseJobs, eq(journalMatches.id, openDotaParseJobs.matchId))
    .where(eq(journalMatches.id, matchId))
    .limit(1);
  if (!source) return null;
  const replayParsed = Boolean(source.rawData && hasParsedOpenDotaReplay(source.rawData as Record<string, unknown>));
  return {
    status: matchAnalysisStatus({ replayParsed, parseStatus: source.parseStatus, startedAt: source.startedAt }),
    errorCode: source.errorCode,
  };
}

async function queueImagesIfNeeded(matchId: string) {
  const now = new Date();
  await getDb().insert(matchImageJobs).values({ matchId, runAfter: now, updatedAt: now }).onConflictDoUpdate({
    target: matchImageJobs.matchId,
    set: { status: "pending", attempts: 0, runAfter: now, startedAt: null, lockedAt: null, finishedAt: null, errorCode: null, errorMessage: null, progressStage: "queued", currentImage: 0, completedImages: 0, updatedAt: now },
    setWhere: eq(matchImageJobs.status, "failed"),
  });
}

export async function requestOpenDotaAnalysis(matchId: string, userId?: string) {
  const db = getDb();
  const [source] = await db.select({
    userId: journalMatches.userId,
    dotaMatchId: journalMatches.dotaMatchId,
    startedAt: journalMatches.startedAt,
    rawData: dotaMatches.rawData,
    parseStatus: openDotaParseJobs.status,
  })
    .from(journalMatches).leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId)).leftJoin(openDotaParseJobs, eq(journalMatches.id, openDotaParseJobs.matchId))
    .where(eq(journalMatches.id, matchId)).limit(1);
  if (!source?.dotaMatchId || (userId && source.userId !== userId)) return "not_found" as const;
  const replayParsed = Boolean(source.rawData && hasParsedOpenDotaReplay(source.rawData as Record<string, unknown>));
  const state = matchAnalysisStatus({ replayParsed, parseStatus: source.parseStatus, startedAt: source.startedAt });
  if (state === "ready") {
    await queueImagesIfNeeded(matchId);
    return "ready" as const;
  }
  if (state === "expired") return "expired" as const;
  if (state === "pending" || state === "processing") return "already_queued" as const;
  const now = new Date();
  await db.insert(openDotaParseJobs).values({ matchId, dotaMatchId: source.dotaMatchId, runAfter: now, updatedAt: now }).onConflictDoUpdate({
    target: openDotaParseJobs.matchId,
    set: { status: "pending", providerJobId: null, attempts: 0, pollAttempts: 0, runAfter: now, lockedAt: null, finishedAt: null, errorCode: null, errorMessage: null, updatedAt: now },
  });
  return "queued" as const;
}

export async function requestOpenDotaAnalysisRange(
  userId: string,
  from: string,
  to: string,
  gameModes?: MatchSyncGameMode[],
) {
  const rows = await getDb().select({
    id: journalMatches.id,
    day: journalDays.day,
    gameMode: dotaMatches.gameMode,
    lobbyType: dotaMatches.lobbyType,
  })
    .from(journalMatches)
    .innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
    .innerJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .where(and(eq(journalMatches.userId, userId), isNotNull(journalMatches.dotaMatchId), gte(journalDays.day, from), lte(journalDays.day, to)));
  const summary = {
    tokenCostPerMatch: ANALYSIS_TOKEN_COST,
    totalTokenCost: 0,
    queued: 0,
    alreadyReady: 0,
    alreadyQueued: 0,
    failed: 0,
    skippedOld: 0,
    skippedOldDays: [] as string[],
  };
  const oldDays = new Set<string>();
  for (const row of rows.filter((candidate) =>
    matchesSyncGameMode(gameModes, candidate.gameMode, candidate.lobbyType))) {
    const result = await requestOpenDotaAnalysis(row.id, userId);
    if (result === "queued") summary.queued += 1;
    else if (result === "ready") summary.alreadyReady += 1;
    else if (result === "already_queued") summary.alreadyQueued += 1;
    else if (result === "expired") { summary.skippedOld += 1; oldDays.add(row.day); }
    else summary.failed += 1;
  }
  summary.totalTokenCost = summary.queued * ANALYSIS_TOKEN_COST;
  summary.skippedOldDays = [...oldDays].sort();
  return summary;
}

export async function recoverStaleOpenDotaParseJobs(config: OpenDotaParseConfig) {
  const db = getDb(); const now = new Date(); const staleBefore = new Date(now.getTime() - config.staleLockSeconds * 1_000);
  return db.transaction(async (tx) => {
    const stale = await tx.select({ id: openDotaParseJobs.id, attempts: openDotaParseJobs.attempts }).from(openDotaParseJobs)
      .where(and(eq(openDotaParseJobs.status, "processing"), isNotNull(openDotaParseJobs.lockedAt), lte(openDotaParseJobs.lockedAt, staleBefore)))
      .orderBy(asc(openDotaParseJobs.lockedAt)).limit(50).for("update", { skipLocked: true });
    let recovered = 0; let failed = 0;
    for (const job of stale) {
      const exhausted = job.attempts >= config.maxAttempts;
      await tx.update(openDotaParseJobs).set({ status: exhausted ? "failed" : "pending", lockedAt: null, runAfter: now, finishedAt: exhausted ? now : null, errorCode: "opendota_parse_stale_lock", errorMessage: "stale parse worker lease recovered", updatedAt: now }).where(eq(openDotaParseJobs.id, job.id));
      if (exhausted) failed += 1; else recovered += 1;
    }
    return { recovered, failed };
  });
}

export async function claimNextOpenDotaParseJob() {
  const db = getDb(); const now = new Date();
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select({ id: openDotaParseJobs.id, matchId: openDotaParseJobs.matchId, dotaMatchId: openDotaParseJobs.dotaMatchId, providerJobId: openDotaParseJobs.providerJobId, attempts: openDotaParseJobs.attempts, pollAttempts: openDotaParseJobs.pollAttempts })
      .from(openDotaParseJobs).where(and(eq(openDotaParseJobs.status, "pending"), lte(openDotaParseJobs.runAfter, now)))
      .orderBy(asc(openDotaParseJobs.runAfter), asc(openDotaParseJobs.createdAt), asc(openDotaParseJobs.id)).limit(1).for("update", { skipLocked: true });
    if (!candidate) return null;
    const [claimed] = await tx.update(openDotaParseJobs).set({ status: "processing", lockedAt: now, updatedAt: now })
      .where(and(eq(openDotaParseJobs.id, candidate.id), eq(openDotaParseJobs.status, "pending"))).returning({ lockedAt: openDotaParseJobs.lockedAt });
    if (!claimed?.lockedAt) return null;
    return { ...candidate, lockedAt: claimed.lockedAt } satisfies ClaimedOpenDotaParseJob;
  });
}

export async function getOpenDotaParseJobSource(job: ClaimedOpenDotaParseJob) {
  const [source] = await getDb().select({ userId: journalMatches.userId, journalMatchId: journalMatches.id, dotaMatchId: journalMatches.dotaMatchId, startedAt: journalMatches.startedAt, steamAccountId: users.steamAccountId })
    .from(journalMatches).innerJoin(users, eq(journalMatches.userId, users.id))
    .where(and(eq(journalMatches.id, job.matchId), eq(journalMatches.dotaMatchId, job.dotaMatchId))).limit(1);
  return source || null;
}

function lease(job: ClaimedOpenDotaParseJob) {
  return and(eq(openDotaParseJobs.id, job.id), eq(openDotaParseJobs.status, "processing"), eq(openDotaParseJobs.lockedAt, job.lockedAt));
}

export async function markOpenDotaParseRequested(job: ClaimedOpenDotaParseJob, providerJobId: string, pollAfterSeconds: number) {
  const now = new Date();
  const [updated] = await getDb().update(openDotaParseJobs).set({ status: "pending", providerJobId, attempts: sql`${openDotaParseJobs.attempts} + 1`, runAfter: new Date(now.getTime() + pollAfterSeconds * 1_000), lockedAt: null, errorCode: null, errorMessage: null, updatedAt: now }).where(lease(job)).returning({ id: openDotaParseJobs.id });
  if (!updated) throw new Error("OpenDota parse job lease was lost");
}

export async function rescheduleOpenDotaParsePoll(job: ClaimedOpenDotaParseJob, pollAfterSeconds: number) {
  const now = new Date();
  const [updated] = await getDb().update(openDotaParseJobs).set({ status: "pending", pollAttempts: sql`${openDotaParseJobs.pollAttempts} + 1`, runAfter: new Date(now.getTime() + pollAfterSeconds * 1_000), lockedAt: null, updatedAt: now }).where(lease(job)).returning({ id: openDotaParseJobs.id });
  if (!updated) throw new Error("OpenDota parse job lease was lost");
}

export async function completeOpenDotaParseJob(job: ClaimedOpenDotaParseJob) {
  const now = new Date();
  const [updated] = await getDb().update(openDotaParseJobs).set({ status: "completed", lockedAt: null, finishedAt: now, errorCode: null, errorMessage: null, updatedAt: now }).where(lease(job)).returning({ id: openDotaParseJobs.id });
  if (!updated) throw new Error("OpenDota parse job lease was lost");
}

export async function failOrRetryOpenDotaParseJob(job: ClaimedOpenDotaParseJob, config: OpenDotaParseConfig, errorCode: string, errorMessage: string, retryAfterSeconds?: number, permanent = false, countSubmissionAttempt = false) {
  const now = new Date(); const attempts = job.attempts + (countSubmissionAttempt ? 1 : 0);
  const exhausted = permanent || attempts >= config.maxAttempts || job.pollAttempts >= config.maxPollAttempts;
  const delay = retryAfterSeconds || Math.min(3_600, config.retryBaseSeconds * 2 ** Math.min(5, attempts));
  const [updated] = await getDb().update(openDotaParseJobs).set({ status: exhausted ? "failed" : "pending", attempts: countSubmissionAttempt ? sql`${openDotaParseJobs.attempts} + 1` : openDotaParseJobs.attempts, lockedAt: null, runAfter: exhausted ? now : new Date(now.getTime() + delay * 1_000), finishedAt: exhausted ? now : null, errorCode: errorCode.slice(0, 64), errorMessage: errorMessage.slice(0, 1_000), updatedAt: now }).where(lease(job)).returning({ id: openDotaParseJobs.id });
  if (!updated) throw new Error("OpenDota parse job lease was lost");
  return exhausted ? "failed" as const : "pending" as const;
}
