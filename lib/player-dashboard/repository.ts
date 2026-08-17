import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../db";
import {
  journalMatches,
  matchImageJobs,
  matchImages,
  users,
} from "../db/schema";

export async function getPlayerSyncSnapshot(userId: string) {
  const db = getDb();
  const [user] = await db
    .select({
      createdAt: users.createdAt,
      lastManualSyncAt: users.lastManualSyncAt,
      manualSyncCursorAt: users.manualSyncCursorAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const queuedJobs = alias(matchImageJobs, "queued_image_jobs");
  const [jobs, countRows] = await Promise.all([
    db
      .select({
        id: matchImageJobs.id,
        matchId: journalMatches.id,
        dotaMatchId: journalMatches.dotaMatchId,
        heroName: journalMatches.heroName,
        status: matchImageJobs.status,
        attempts: matchImageJobs.attempts,
        runAfter: matchImageJobs.runAfter,
        finishedAt: matchImageJobs.finishedAt,
        errorCode: matchImageJobs.errorCode,
        updatedAt: matchImageJobs.updatedAt,
        imageCount: sql<number>`(
          select count(*)::int
          from ${matchImages}
          where ${matchImages.matchId} = ${journalMatches.id}
        )`,
        queueAhead: sql<number>`(
          select count(*)::int
          from ${queuedJobs}
          where
            ${matchImageJobs.status} = 'pending'
            and (
              ${queuedJobs.status} = 'processing'
              or (
                ${queuedJobs.status} = 'pending'
                and (
                  ${queuedJobs.runAfter} < ${matchImageJobs.runAfter}
                  or (
                    ${queuedJobs.runAfter} = ${matchImageJobs.runAfter}
                    and (
                      ${queuedJobs.createdAt} < ${matchImageJobs.createdAt}
                      or (
                        ${queuedJobs.createdAt} = ${matchImageJobs.createdAt}
                        and ${queuedJobs.id} < ${matchImageJobs.id}
                      )
                    )
                  )
                )
              )
            )
        )`,
      })
      .from(matchImageJobs)
      .innerJoin(
        journalMatches,
        eq(matchImageJobs.matchId, journalMatches.id),
      )
      .where(eq(journalMatches.userId, userId))
      .orderBy(desc(matchImageJobs.updatedAt))
      .limit(30),
    db
      .select({
        status: matchImageJobs.status,
        total: sql<number>`count(*)::int`,
      })
      .from(matchImageJobs)
      .innerJoin(
        journalMatches,
        eq(matchImageJobs.matchId, journalMatches.id),
      )
      .where(eq(journalMatches.userId, userId))
      .groupBy(matchImageJobs.status),
  ]);

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of countRows) counts[row.status] = row.total;

  return { user, jobs, counts };
}

export function serializePlayerSyncSnapshot(
  snapshot: NonNullable<Awaited<ReturnType<typeof getPlayerSyncSnapshot>>>,
  cooldownSeconds: number,
) {
  const nextAllowedAt = snapshot.user.lastManualSyncAt
    ? new Date(
        snapshot.user.lastManualSyncAt.getTime() + cooldownSeconds * 1_000,
      )
    : null;

  return {
    registeredAt: snapshot.user.createdAt.toISOString(),
    trackedThrough: snapshot.user.manualSyncCursorAt?.toISOString() || null,
    lastSyncAt: snapshot.user.lastManualSyncAt?.toISOString() || null,
    nextAllowedAt: nextAllowedAt?.toISOString() || null,
    imageQueue: {
      counts: snapshot.counts,
      jobs: snapshot.jobs.map((job) => ({
        id: job.id,
        matchId: job.matchId,
        dotaMatchId:
          job.dotaMatchId === null ? null : String(job.dotaMatchId),
        heroName: job.heroName,
        status: job.status,
        attempts: job.attempts,
        position:
          job.status === "processing"
            ? 1
            : job.status === "pending"
              ? job.queueAhead + 1
              : null,
        imageCount: job.imageCount,
        runAfter: job.runAfter.toISOString(),
        finishedAt: job.finishedAt?.toISOString() || null,
        errorCode: job.errorCode,
        updatedAt: job.updatedAt.toISOString(),
      })),
    },
  };
}
