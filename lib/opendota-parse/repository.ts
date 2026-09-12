import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dotaMatches, journalMatches, openDotaParseJobs, users } from "@/lib/db/schema";
import { hasParsedOpenDotaReplay } from "@/lib/opendota/validation";
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

export async function enqueueOpenDotaParseIfNeeded(matchId: string) {
  const db = getDb();
  const [source] = await db.select({ dotaMatchId: journalMatches.dotaMatchId, rawData: dotaMatches.rawData, parseStatus: openDotaParseJobs.status })
    .from(journalMatches).leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId)).leftJoin(openDotaParseJobs, eq(journalMatches.id, openDotaParseJobs.matchId))
    .where(eq(journalMatches.id, matchId)).limit(1);
  if (!source?.dotaMatchId || (source.rawData && hasParsedOpenDotaReplay(source.rawData as Record<string, unknown>))) return "ready" as const;
  if (source.parseStatus === "failed") return "failed" as const;
  const now = new Date();
  await db.insert(openDotaParseJobs).values({ matchId, dotaMatchId: source.dotaMatchId, runAfter: now, updatedAt: now }).onConflictDoNothing({ target: openDotaParseJobs.matchId });
  return "queued" as const;
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
  const [source] = await getDb().select({ userId: journalMatches.userId, journalMatchId: journalMatches.id, dotaMatchId: journalMatches.dotaMatchId, steamAccountId: users.steamAccountId })
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
