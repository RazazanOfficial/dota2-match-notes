import {
  and,
  asc,
  eq,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  dotaMatches,
  journalMatches,
  matchImageJobs,
  users,
} from "../db/schema";
import type { MatchImageJobConfig } from "./config";

export interface ClaimedMatchImageJob {
  id: string;
  matchId: string;
  attempts: number;
  lockedAt: Date;
}

export async function recoverStaleMatchImageJobs(
  config: MatchImageJobConfig,
) {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - config.staleLockSeconds * 1_000);

  return db.transaction(async (tx) => {
    const staleJobs = await tx
      .select({
        id: matchImageJobs.id,
        attempts: matchImageJobs.attempts,
      })
      .from(matchImageJobs)
      .where(
        and(
          eq(matchImageJobs.status, "processing"),
          isNotNull(matchImageJobs.lockedAt),
          lte(matchImageJobs.lockedAt, staleBefore),
        ),
      )
      .orderBy(asc(matchImageJobs.lockedAt))
      .limit(100)
      .for("update", { skipLocked: true });
    let recovered = 0;
    let failed = 0;

    for (const job of staleJobs) {
      if (job.attempts >= config.maxAttempts) {
        await tx
          .update(matchImageJobs)
          .set({
            status: "failed",
            lockedAt: null,
            finishedAt: now,
            errorCode: "image_job_stale_lock",
            errorMessage: "maximum attempts reached after a stale lock",
            updatedAt: now,
          })
          .where(eq(matchImageJobs.id, job.id));
        failed += 1;
      } else {
        await tx
          .update(matchImageJobs)
          .set({
            status: "pending",
            lockedAt: null,
            runAfter: now,
            errorCode: "image_job_stale_lock",
            errorMessage: "stale lock recovered",
            updatedAt: now,
          })
          .where(eq(matchImageJobs.id, job.id));
        recovered += 1;
      }
    }

    return { recovered, failed };
  });
}

export async function claimNextMatchImageJob() {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: matchImageJobs.id,
        matchId: matchImageJobs.matchId,
        attempts: matchImageJobs.attempts,
      })
      .from(matchImageJobs)
      .where(
        and(
          eq(matchImageJobs.status, "pending"),
          lte(matchImageJobs.runAfter, now),
        ),
      )
      .orderBy(
        asc(matchImageJobs.runAfter),
        asc(matchImageJobs.createdAt),
        asc(matchImageJobs.id),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;

    const [claimed] = await tx
      .update(matchImageJobs)
      .set({
        status: "processing",
        attempts: sql`${matchImageJobs.attempts} + 1`,
        lockedAt: now,
        finishedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(matchImageJobs.id, candidate.id),
          eq(matchImageJobs.status, "pending"),
        ),
      )
      .returning({
        attempts: matchImageJobs.attempts,
        lockedAt: matchImageJobs.lockedAt,
      });
    if (!claimed?.lockedAt) return null;

    return {
      ...candidate,
      attempts: claimed.attempts,
      lockedAt: claimed.lockedAt,
    } satisfies ClaimedMatchImageJob;
  });
}

export async function getMatchImageJobSource(matchId: string) {
  const [source] = await getDb()
    .select({
      matchId: journalMatches.id,
      dotaMatchId: journalMatches.dotaMatchId,
      steamAccountId: users.steamAccountId,
      rawData: dotaMatches.rawData,
    })
    .from(journalMatches)
    .innerJoin(users, eq(journalMatches.userId, users.id))
    .innerJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .where(eq(journalMatches.id, matchId))
    .limit(1);

  return source || null;
}

export async function completeMatchImageJob(job: ClaimedMatchImageJob) {
  const finishedAt = new Date();
  const [completed] = await getDb()
    .update(matchImageJobs)
    .set({
      status: "completed",
      lockedAt: null,
      finishedAt,
      errorCode: null,
      errorMessage: null,
      updatedAt: finishedAt,
    })
    .where(
      and(
        eq(matchImageJobs.id, job.id),
        eq(matchImageJobs.status, "processing"),
        eq(matchImageJobs.lockedAt, job.lockedAt),
      ),
    )
    .returning({ id: matchImageJobs.id });
  if (!completed) throw new Error("Match image job lease was lost");
}

export async function rescheduleOrFailMatchImageJob(params: {
  job: ClaimedMatchImageJob;
  config: MatchImageJobConfig;
  errorCode: string;
  errorMessage: string;
  permanent?: boolean;
}) {
  const { job, config } = params;
  const db = getDb();
  const now = new Date();
  const errorCode = params.errorCode.slice(0, 64);
  const errorMessage = params.errorMessage.slice(0, 1_000);

  if (params.permanent || job.attempts >= config.maxAttempts) {
    const [failed] = await db
      .update(matchImageJobs)
      .set({
        status: "failed",
        lockedAt: null,
        finishedAt: now,
        errorCode,
        errorMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(matchImageJobs.id, job.id),
          eq(matchImageJobs.status, "processing"),
          eq(matchImageJobs.lockedAt, job.lockedAt),
        ),
      )
      .returning({ id: matchImageJobs.id });
    if (!failed) throw new Error("Match image job lease was lost");
    return { status: "failed" as const, runAfter: null };
  }

  const retrySeconds = Math.min(
    21_600,
    config.retryBaseSeconds * 2 ** Math.max(0, job.attempts - 1),
  );
  const runAfter = new Date(now.getTime() + retrySeconds * 1_000);
  const [rescheduled] = await db
    .update(matchImageJobs)
    .set({
      status: "pending",
      lockedAt: null,
      runAfter,
      errorCode,
      errorMessage,
      updatedAt: now,
    })
    .where(
      and(
        eq(matchImageJobs.id, job.id),
        eq(matchImageJobs.status, "processing"),
        eq(matchImageJobs.lockedAt, job.lockedAt),
      ),
    )
    .returning({ id: matchImageJobs.id });
  if (!rescheduled) throw new Error("Match image job lease was lost");
  return { status: "pending" as const, runAfter };
}
