import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { syncJobs, users } from "@/lib/db/schema";
import type { SyncWorkerConfig } from "./config";

export interface ClaimedScheduledJob {
  id: string;
  userId: string;
  attempts: number;
  lockedAt: Date;
  steamId: string;
  steamAccountId: number;
  lastManualSyncAt: Date | null;
  lastScheduledSyncAt: Date | null;
}

export async function enqueueDueScheduledSyncJobs(
  config: SyncWorkerConfig,
) {
  const db = getDb();
  const now = new Date();
  const dueBefore = new Date(now.getTime() - config.intervalSeconds * 1_000);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('scheduled-sync-enqueue', 0))`,
    );
    const activeJob = tx
      .select({ value: sql<number>`1` })
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.userId, users.id),
          inArray(syncJobs.status, ["pending", "processing"]),
        ),
      );
    const dueUsers = await tx
      .select({ userId: users.id })
      .from(users)
      .where(
        and(
          or(
            isNull(users.lastScheduledSyncAt),
            lte(users.lastScheduledSyncAt, dueBefore),
          ),
          notExists(activeJob),
        ),
      )
      .orderBy(
        sql`${users.lastScheduledSyncAt} asc nulls first`,
        asc(users.createdAt),
      )
      .limit(config.enqueueBatchSize);

    if (!dueUsers.length) return 0;
    const inserted = await tx
      .insert(syncJobs)
      .values(
        dueUsers.map(({ userId }) => ({
          userId,
          kind: "scheduled" as const,
          status: "pending" as const,
          runAfter: now,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: syncJobs.id });
    return inserted.length;
  });
}

export async function recoverStaleScheduledJobs(config: SyncWorkerConfig) {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - config.staleLockSeconds * 1_000);

  return db.transaction(async (tx) => {
    const staleJobs = await tx
      .select({
        id: syncJobs.id,
        userId: syncJobs.userId,
        attempts: syncJobs.attempts,
      })
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.kind, "scheduled"),
          eq(syncJobs.status, "processing"),
          isNotNull(syncJobs.lockedAt),
          lte(syncJobs.lockedAt, staleBefore),
        ),
      )
      .orderBy(asc(syncJobs.lockedAt))
      .limit(100)
      .for("update", { skipLocked: true });
    let recovered = 0;
    let failed = 0;

    for (const job of staleJobs) {
      if (job.attempts >= config.maxAttempts) {
        await tx
          .update(syncJobs)
          .set({
            status: "failed",
            lockedAt: null,
            finishedAt: now,
            errorMessage: "sync_worker_stale_lock: maximum attempts reached",
          })
          .where(eq(syncJobs.id, job.id));
        await tx
          .update(users)
          .set({ lastScheduledSyncAt: now, updatedAt: now })
          .where(eq(users.id, job.userId));
        failed += 1;
      } else {
        await tx
          .update(syncJobs)
          .set({
            status: "pending",
            lockedAt: null,
            runAfter: now,
            errorMessage: "sync_worker_stale_lock: recovered",
          })
          .where(eq(syncJobs.id, job.id));
        recovered += 1;
      }
    }

    return { recovered, failed };
  });
}

export async function claimNextScheduledSyncJob() {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: syncJobs.id,
        userId: syncJobs.userId,
        attempts: syncJobs.attempts,
        steamId: users.steamId,
        steamAccountId: users.steamAccountId,
        lastManualSyncAt: users.lastManualSyncAt,
        lastScheduledSyncAt: users.lastScheduledSyncAt,
      })
      .from(syncJobs)
      .innerJoin(users, eq(syncJobs.userId, users.id))
      .where(
        and(
          eq(syncJobs.kind, "scheduled"),
          eq(syncJobs.status, "pending"),
          lte(syncJobs.runAfter, now),
        ),
      )
      .orderBy(asc(syncJobs.runAfter), asc(syncJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;

    const [claimed] = await tx
      .update(syncJobs)
      .set({
        status: "processing",
        attempts: sql`${syncJobs.attempts} + 1`,
        lockedAt: now,
        finishedAt: null,
      })
      .where(
        and(eq(syncJobs.id, candidate.id), eq(syncJobs.status, "pending")),
      )
      .returning({
        attempts: syncJobs.attempts,
        lockedAt: syncJobs.lockedAt,
      });
    if (!claimed?.lockedAt) return null;

    return {
      ...candidate,
      attempts: claimed.attempts,
      lockedAt: claimed.lockedAt,
    } satisfies ClaimedScheduledJob;
  });
}

export async function completeScheduledSyncJob(job: ClaimedScheduledJob) {
  const db = getDb();
  const finishedAt = new Date();

  await db.transaction(async (tx) => {
    const [completed] = await tx
      .update(syncJobs)
      .set({
        status: "completed",
        lockedAt: null,
        finishedAt,
        errorMessage: null,
      })
      .where(
        and(
          eq(syncJobs.id, job.id),
          eq(syncJobs.status, "processing"),
          eq(syncJobs.lockedAt, job.lockedAt),
        ),
      )
      .returning({ id: syncJobs.id });
    if (!completed) throw new Error("Scheduled sync job lease was lost");
    await tx
      .update(users)
      .set({ lastScheduledSyncAt: finishedAt, updatedAt: finishedAt })
      .where(eq(users.id, job.userId));
  });
}

export async function rescheduleOrFailScheduledSyncJob(params: {
  job: ClaimedScheduledJob;
  config: SyncWorkerConfig;
  errorMessage: string;
  retryAfterSeconds?: number;
}) {
  const { job, config } = params;
  const db = getDb();
  const now = new Date();
  const errorMessage = params.errorMessage.slice(0, 1_000);

  if (job.attempts >= config.maxAttempts) {
    await db.transaction(async (tx) => {
      const [failed] = await tx
        .update(syncJobs)
        .set({
          status: "failed",
          lockedAt: null,
          finishedAt: now,
          errorMessage,
        })
        .where(
          and(
            eq(syncJobs.id, job.id),
            eq(syncJobs.status, "processing"),
            eq(syncJobs.lockedAt, job.lockedAt),
          ),
        )
        .returning({ id: syncJobs.id });
      if (!failed) throw new Error("Scheduled sync job lease was lost");
      await tx
        .update(users)
        .set({ lastScheduledSyncAt: now, updatedAt: now })
        .where(eq(users.id, job.userId));
    });
    return { status: "failed" as const, runAfter: null };
  }

  const exponentialDelay =
    config.retryBaseSeconds * 2 ** Math.max(0, job.attempts - 1);
  const retrySeconds = Math.min(
    21_600,
    Math.max(exponentialDelay, params.retryAfterSeconds || 0),
  );
  const runAfter = new Date(now.getTime() + retrySeconds * 1_000);
  const [rescheduled] = await db
    .update(syncJobs)
    .set({
      status: "pending",
      lockedAt: null,
      runAfter,
      errorMessage,
    })
    .where(
      and(
        eq(syncJobs.id, job.id),
        eq(syncJobs.status, "processing"),
        eq(syncJobs.lockedAt, job.lockedAt),
      ),
    )
    .returning({ id: syncJobs.id });
  if (!rescheduled) throw new Error("Scheduled sync job lease was lost");
  return { status: "pending" as const, runAfter };
}
