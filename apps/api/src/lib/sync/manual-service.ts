import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { syncJobs, users } from "../db/schema";
import { getOpenDotaConfig } from "../opendota/config";
import { OpenDotaError } from "../opendota/errors";
import { claimManualOpenDotaSync, markJournalRangeCompleted, releaseManualOpenDotaSyncClaim } from "../opendota/repository";
import { syncManualRangeBatch } from "../opendota/service";
import { MATCH_SYNC_GAME_MODES, manualMatchSyncInputSchema, saturdayWeekStart, type ManualMatchSyncInput } from "../opendota/sync-request";
import { toJournalDateKey } from "../journal/timezone";
import type { ManualSyncResult } from "../types";

type ManualResult = Pick<ManualSyncResult, "checked" | "alreadyImported" | "dismissedByUser" | "imported" | "failed" | "deferred" | "ignoredOlder">;

function emptyResult(): ManualResult {
  return { checked: 0, alreadyImported: 0, dismissedByUser: 0, imported: [], failed: [], deferred: 0, ignoredOlder: 0 };
}

export async function enqueueManualRangeSync(userId: string, request: ManualMatchSyncInput) {
  request = manualMatchSyncInputSchema.parse(request);
  const db = getDb();
  const [user] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new OpenDotaError(404, "user_not_found", "حساب کاربر پیدا نشد");
  if (request.from < saturdayWeekStart(toJournalDateKey(user.createdAt))) {
    throw new OpenDotaError(400, "before_tracking_window", "دریافت مچ فقط از ابتدای هفته ثبت‌نام امکان‌پذیر است");
  }
  const [active] = await db.select({ id: syncJobs.id }).from(syncJobs)
    .where(and(eq(syncJobs.userId, userId), sql`${syncJobs.status} in ('pending','processing')`)).limit(1);
  if (active) throw new OpenDotaError(409, "sync_in_progress", "دریافت قبلی هنوز در حال انجام است");
  const config = getOpenDotaConfig();
  const claimedAt = await claimManualOpenDotaSync(userId,
    request.scope === "day" ? config.manualDayCooldownSeconds : request.scope === "month" ? config.manualMonthCooldownSeconds : config.manualSyncCooldownSeconds, request.scope);
  try {
    const [job] = await db.insert(syncJobs).values({
      userId, kind: "manual", status: "pending", manualRequest: request, manualAttempted: [], manualResult: emptyResult(),
    }).onConflictDoNothing().returning({ id: syncJobs.id });
    if (!job) throw new OpenDotaError(409, "sync_in_progress", "دریافت قبلی هنوز در حال انجام است");
    return job.id;
  } catch (error) {
    await releaseManualOpenDotaSyncClaim(userId, claimedAt, request.scope);
    throw error;
  }
}

export async function latestManualRangeJob(userId: string) {
  const [job] = await getDb().select({
    id: syncJobs.id, status: syncJobs.status, request: syncJobs.manualRequest,
    attempted: syncJobs.manualAttempted, result: syncJobs.manualResult,
    error: syncJobs.errorMessage, finishedAt: syncJobs.finishedAt,
  }).from(syncJobs).where(and(eq(syncJobs.userId, userId), eq(syncJobs.kind, "manual")))
    .orderBy(desc(syncJobs.createdAt)).limit(1);
  return job || null;
}

export async function runManualRangeSyncTick() {
  const db = getDb();
  const now = new Date();
  await db.update(syncJobs).set({ status: "pending", lockedAt: null, runAfter: now,
    errorMessage: "manual_sync_stale_lock_recovered" })
    .where(and(eq(syncJobs.kind, "manual"), eq(syncJobs.status, "processing"),
      lte(syncJobs.lockedAt, new Date(now.getTime() - 6 * 60_000)), sql`${syncJobs.attempts} < 30`));
  await db.update(syncJobs).set({ status: "failed", lockedAt: null, finishedAt: now,
    errorMessage: "manual_sync_retry_exhausted" })
    .where(and(eq(syncJobs.kind, "manual"), eq(syncJobs.status, "processing"),
      lte(syncJobs.lockedAt, new Date(now.getTime() - 6 * 60_000)), sql`${syncJobs.attempts} >= 30`));
  const claimed = await db.transaction(async (tx) => {
    const [candidate] = await tx.select({
      id: syncJobs.id, userId: syncJobs.userId, request: syncJobs.manualRequest,
      attempted: syncJobs.manualAttempted, result: syncJobs.manualResult, attempts: syncJobs.attempts,
      steamAccountId: users.steamAccountId, createdAt: users.createdAt,
    }).from(syncJobs).innerJoin(users, eq(syncJobs.userId, users.id))
      .where(and(eq(syncJobs.kind, "manual"), eq(syncJobs.status, "pending"), lte(syncJobs.runAfter, now)))
      .orderBy(asc(syncJobs.runAfter), asc(syncJobs.createdAt)).limit(1).for("update", { skipLocked: true });
    if (!candidate) return null;
    const [lease] = await tx.update(syncJobs).set({ status: "processing", lockedAt: now,
      attempts: sql`${syncJobs.attempts} + 1` }).where(and(eq(syncJobs.id, candidate.id), eq(syncJobs.status, "pending")))
      .returning({ lockedAt: syncJobs.lockedAt });
    return lease?.lockedAt ? { ...candidate, lockedAt: lease.lockedAt } : null;
  });
  if (!claimed) return { processed: 0 };
  const request = claimed.request as ManualMatchSyncInput;
  const previous = (claimed.result || emptyResult()) as ManualResult;
  try {
    const batch = await syncManualRangeBatch({ id: claimed.userId, steamAccountId: claimed.steamAccountId,
      createdAt: claimed.createdAt }, request, claimed.attempted, 5);
    const attempted = [...claimed.attempted, ...batch.attemptedIds];
    const result: ManualResult = {
      checked: batch.checked, alreadyImported: batch.alreadyImported,
      dismissedByUser: batch.dismissedByUser, ignoredOlder: batch.ignoredOlder,
      imported: [...previous.imported, ...batch.imported], failed: [...previous.failed, ...batch.failed], deferred: batch.deferred,
    };
    const completed = batch.deferred === 0;
    if (completed && !result.failed.length &&
        (!request.gameModes || new Set(request.gameModes).size === MATCH_SYNC_GAME_MODES.length)) {
      await markJournalRangeCompleted(claimed.userId, request.from, request.to);
    }
    const [saved] = await db.update(syncJobs).set({ status: completed ? "completed" : "pending", lockedAt: null,
      attempts: 0,
      runAfter: new Date(Date.now() + 1_000), finishedAt: completed ? new Date() : null,
      manualAttempted: attempted, manualResult: result, errorMessage: null })
      .where(and(eq(syncJobs.id, claimed.id), eq(syncJobs.status, "processing"), eq(syncJobs.lockedAt, claimed.lockedAt)))
      .returning({ id: syncJobs.id });
    if (!saved) throw new Error("Manual sync lease expired");
    return { processed: 1, id: claimed.id, status: completed ? "completed" : "pending", attempted: attempted.length, remaining: batch.deferred };
  } catch (error) {
    const transient = error instanceof OpenDotaError && (error.status === 429 || error.status >= 500);
    const retries = claimed.attempts + 1;
    const canRetry = transient && retries < 30;
    await db.update(syncJobs).set({ status: canRetry ? "pending" : "failed", lockedAt: null,
      runAfter: new Date(Date.now() + Math.max(90, error instanceof OpenDotaError ? error.retryAfterSeconds || 0 : 0) * 1_000),
      finishedAt: canRetry ? null : new Date(), errorMessage: error instanceof OpenDotaError ? error.code : "manual_sync_failed" })
      .where(and(eq(syncJobs.id, claimed.id), eq(syncJobs.status, "processing"), eq(syncJobs.lockedAt, claimed.lockedAt)));
    return { processed: 1, id: claimed.id, status: canRetry ? "pending" : "failed", errorCode: error instanceof OpenDotaError ? error.code : "manual_sync_failed" };
  }
}
