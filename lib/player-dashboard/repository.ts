import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../db";
import {
  journalMatches,
  matchImageJobs,
  matchImages,
  openDotaParseJobs,
  users,
} from "../db/schema";

export function buildQueueAheadExpression() {
  const queuedJobs = alias(matchImageJobs, "queued_image_jobs");

  return sql<number>`(
    select count(*)::int
    from ${matchImageJobs} as "queued_image_jobs"
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
  )`;
}

export function buildParseQueueAheadExpression() {
  const queuedJobs = alias(openDotaParseJobs, "queued_parse_jobs");
  return sql<number>`(
    select count(*)::int from ${openDotaParseJobs} as "queued_parse_jobs"
    where ${queuedJobs.status} = 'processing' or (
      ${queuedJobs.status} = 'pending' and (
        ${queuedJobs.runAfter} < ${openDotaParseJobs.runAfter} or (
          ${queuedJobs.runAfter} = ${openDotaParseJobs.runAfter} and (
            ${queuedJobs.createdAt} < ${openDotaParseJobs.createdAt} or (
              ${queuedJobs.createdAt} = ${openDotaParseJobs.createdAt} and ${queuedJobs.id} < ${openDotaParseJobs.id}
            )
          )
        )
      )
    )
  )`;
}

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

  const [imageJobs, countRows, parseJobs] = await Promise.all([
    db
      .select({
        id: matchImageJobs.id,
        matchId: journalMatches.id,
        dotaMatchId: journalMatches.dotaMatchId,
        heroId: journalMatches.heroId,
        heroName: journalMatches.heroName,
        status: matchImageJobs.status,
        attempts: matchImageJobs.attempts,
        runAfter: matchImageJobs.runAfter,
        finishedAt: matchImageJobs.finishedAt,
        errorCode: matchImageJobs.errorCode,
        updatedAt: matchImageJobs.updatedAt,
        createdAt: matchImageJobs.createdAt,
        imageCount: sql<number>`(
          select count(*)::int
          from ${matchImages}
          where ${matchImages.matchId} = ${journalMatches.id}
        )`,
        queueAhead: buildQueueAheadExpression(),
      })
      .from(matchImageJobs)
      .innerJoin(
        journalMatches,
        eq(matchImageJobs.matchId, journalMatches.id),
      )
      .where(
        and(
          eq(journalMatches.userId, userId),
          inArray(matchImageJobs.status, ["pending", "processing"]),
        ),
      ),
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
    db.select({
      id: openDotaParseJobs.id,
      matchId: journalMatches.id,
      dotaMatchId: journalMatches.dotaMatchId,
      heroId: journalMatches.heroId,
      heroName: journalMatches.heroName,
      status: openDotaParseJobs.status,
      attempts: openDotaParseJobs.attempts,
      runAfter: openDotaParseJobs.runAfter,
      finishedAt: openDotaParseJobs.finishedAt,
      errorCode: openDotaParseJobs.errorCode,
      updatedAt: openDotaParseJobs.updatedAt,
      createdAt: openDotaParseJobs.createdAt,
      queueAhead: buildParseQueueAheadExpression(),
    }).from(openDotaParseJobs).innerJoin(journalMatches, eq(openDotaParseJobs.matchId, journalMatches.id))
      .where(and(eq(journalMatches.userId, userId), inArray(openDotaParseJobs.status, ["pending", "processing"]))),
  ]);

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of countRows) counts[row.status] = row.total;
  for (const job of parseJobs) counts[job.status] += 1;

  const jobs = [
    ...imageJobs.map((job) => ({ ...job, kind: "images" as const })),
    ...parseJobs.map((job) => ({ ...job, kind: "analysis" as const, imageCount: 0 })),
  ].sort((left, right) => {
    if (left.status !== right.status) return left.status === "processing" ? -1 : 1;
    return left.runAfter.getTime() - right.runAfter.getTime() || left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
  }).filter((job, index, all) => all.findIndex((candidate) => candidate.matchId === job.matchId) === index);

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
        heroId: job.heroId,
        heroName: job.heroName,
        status: job.status,
        attempts: job.attempts,
        position: job.status === "processing" ? 1 : job.queueAhead + 1,
        imageCount: job.imageCount,
        runAfter: job.runAfter.toISOString(),
        finishedAt: job.finishedAt?.toISOString() || null,
        errorCode: job.errorCode,
        updatedAt: job.updatedAt.toISOString(),
        kind: job.kind,
      })),
    },
  };
}
