import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { syncJobs, users } from "../db/schema";
import { getOpenDotaConfig } from "../opendota/config";
import { OpenDotaError } from "../opendota/errors";
import { claimManualOpenDotaSync, markJournalRangeCompleted } from "../opendota/repository";
import { fetchSelectedHistory, syncManualRangeBatch } from "../opendota/service";
import { MATCH_SYNC_GAME_MODES, manualMatchSyncInputSchema, saturdayWeekStart, type ManualMatchSyncInput } from "../opendota/sync-request";
import { toJournalDateKey } from "../journal/timezone";
import type { ManualSyncResult } from "../types";

type ManualResult = Pick<ManualSyncResult, "checked" | "alreadyImported" | "dismissedByUser" | "imported" | "failed" | "deferred" | "ignoredOlder"> & {externalRequests?:number; signupRetryCount?:number};
const signupRetryCodes = new Set(["opendota_match_not_found", "player_not_found_in_match"]);
const signupRetryDelayMs = 15 * 60_000;
const signupRetryDeadlineMs = 24 * 60 * 60_000;

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
  const config = getOpenDotaConfig();
  return db.transaction(async tx => {
    // Serialize requests for this account, including independent scope cooldowns.
    // Queue changes and the cooldown claim commit together or roll back together.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [active] = await tx.select({ id: syncJobs.id, kind: syncJobs.kind, status: syncJobs.status })
      .from(syncJobs).where(and(eq(syncJobs.userId, userId), sql`${syncJobs.status} in ('pending','processing')`))
      .limit(1).for("update", { skipLocked: true });
    if (active) {
      if (active.kind !== "scheduled" || active.status !== "pending") {
        throw new OpenDotaError(409, "sync_in_progress", "دریافت قبلی هنوز در حال انجام است");
      }
      // A queued background refresh (including legacy jobs left while scheduled
      // sync is disabled) must yield to an explicit date-range request. Never
      // replace a worker's live processing lease or another manual request.
      await tx.update(syncJobs).set({ status: "failed", finishedAt: new Date(), lockedAt: null,
        errorMessage: "scheduled_sync_superseded_by_manual" }).where(and(eq(syncJobs.id, active.id),
        eq(syncJobs.kind, "scheduled"), eq(syncJobs.status, "pending")));
    }
    await claimManualOpenDotaSync(userId,
      request.scope === "day" ? config.manualDayCooldownSeconds : request.scope === "month" ? config.manualMonthCooldownSeconds : config.manualSyncCooldownSeconds,
      request.scope, tx);
    const [job] = await tx.insert(syncJobs).values({
      userId, kind: "manual", status: "pending", manualRequest: request, manualAttempted: [], manualResult: emptyResult(),
    }).onConflictDoNothing().returning({ id: syncJobs.id });
    if (!job) throw new OpenDotaError(409, "sync_in_progress", "دریافت قبلی هنوز در حال انجام است");
    return job.id;
  });
}

export async function latestManualRangeJob(userId: string) {
  const [job] = await getDb().select({
    id: syncJobs.id, status: syncJobs.status, request: syncJobs.manualRequest,
    attempted: syncJobs.manualAttempted, result: syncJobs.manualResult,
    error: syncJobs.errorMessage, finishedAt: syncJobs.finishedAt,
  }).from(syncJobs).where(and(eq(syncJobs.userId, userId), eq(syncJobs.kind, "manual"),
    sql`coalesce(${syncJobs.manualRequest}->>'source', '') <> 'signup'`))
    .orderBy(desc(syncJobs.createdAt)).limit(1);
  return job || null;
}

export async function runManualRangeSyncTick() {
  const db = getDb();
  const now = new Date();
  await db.update(syncJobs).set({ status: "pending", lockedAt: null, runAfter: now,
    errorMessage: "manual_sync_stale_lock_recovered" })
    .where(and(eq(syncJobs.kind, "manual"), eq(syncJobs.status, "processing"),
      sql`coalesce(${syncJobs.lockedAt}, ${syncJobs.createdAt}) <= ${new Date(now.getTime() - 6 * 60_000)}`, sql`${syncJobs.attempts} < 30`));
  await db.update(syncJobs).set({ status: "failed", lockedAt: null, finishedAt: now,
    errorMessage: "manual_sync_retry_exhausted" })
    .where(and(eq(syncJobs.kind, "manual"), eq(syncJobs.status, "processing"),
      sql`coalesce(${syncJobs.lockedAt}, ${syncJobs.createdAt}) <= ${new Date(now.getTime() - 6 * 60_000)}`, sql`${syncJobs.attempts} >= 30`));
  const claimed = await db.transaction(async (tx) => {
    const [candidate] = await tx.select({
      id: syncJobs.id, userId: syncJobs.userId, request: syncJobs.manualRequest,
      attempted: syncJobs.manualAttempted, snapshot: syncJobs.manualSnapshot, result: syncJobs.manualResult, attempts: syncJobs.attempts,
      steamAccountId: users.steamAccountId, createdAt: users.createdAt, jobCreatedAt: syncJobs.createdAt,
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
  const request = claimed.request as ManualMatchSyncInput & { source?: string; cutoff?: string };
  const signupCutoff = request.source === "signup" && request.cutoff
    ? Date.parse(request.cutoff) : null;
  const previous = (claimed.result || emptyResult()) as ManualResult;
  let externalRequests=0;const onClaim=()=>{externalRequests+=1;};
  try {
    const user={id:claimed.userId,steamAccountId:claimed.steamAccountId,createdAt:claimed.createdAt};
    const snapshot=claimed.snapshot || await fetchSelectedHistory(user,request,onClaim);
    if(!claimed.snapshot) {
      const [saved]=await db.update(syncJobs).set({manualSnapshot:snapshot}).where(and(eq(syncJobs.id,claimed.id),eq(syncJobs.lockedAt,claimed.lockedAt))).returning({id:syncJobs.id});
      if(!saved)throw new Error("Manual sync lease expired");
    }
    const eligibleSnapshot = signupCutoff !== null && Number.isFinite(signupCutoff)
      ? snapshot.filter(match => match.start_time * 1_000 >= signupCutoff)
      : snapshot;
    const batch = await syncManualRangeBatch(user, request, claimed.attempted, 20, eligibleSnapshot,onClaim);
    const attempted = [...new Set([...claimed.attempted, ...batch.attemptedIds])];
    const attemptedNow = new Set(batch.attemptedIds);
    const failed = [...previous.failed.filter(item => !attemptedNow.has(item.dotaMatchId)), ...batch.failed];
    const result: ManualResult = {
      checked: batch.checked, alreadyImported: Math.max(0,batch.alreadyImported-previous.imported.length),
      externalRequests:(previous.externalRequests||0)+externalRequests,
      dismissedByUser: batch.dismissedByUser, ignoredOlder: batch.ignoredOlder,
      imported: [...previous.imported, ...batch.imported], failed, deferred: batch.deferred,
    };
    const retryableIds = request.source === "signup" ? new Set(failed.filter(item => signupRetryCodes.has(item.code)).map(item => item.dotaMatchId)) : new Set<number>();
    const retryCount = (previous.signupRetryCount || 0) + (batch.deferred === 0 && retryableIds.size ? 1 : 0);
    result.signupRetryCount = retryCount;
    const retrySignup = batch.deferred === 0 && retryableIds.size > 0 &&
      retryCount < 96 && Date.now() < claimed.jobCreatedAt.getTime() + signupRetryDeadlineMs;
    const completed = batch.deferred === 0 && !retrySignup;
    const finalStatus = completed && request.source === "signup" && failed.length ? "failed" : completed ? "completed" : "pending";
    if (completed && request.source !== "signup" && !result.failed.length &&
        (!request.gameModes || new Set(request.gameModes).size === MATCH_SYNC_GAME_MODES.length)) {
      await markJournalRangeCompleted(claimed.userId, request.from, request.to);
    }
    const [saved] = await db.update(syncJobs).set({ status: finalStatus, lockedAt: null,
      attempts: 0,
      runAfter: new Date(Date.now() + (retrySignup ? signupRetryDelayMs : 1_000)), finishedAt: completed ? new Date() : null,
      manualAttempted: retrySignup ? attempted.filter(id => !retryableIds.has(id)) : attempted,
      manualResult: result, errorMessage: finalStatus === "failed" ? "signup_match_import_incomplete" : null })
      .where(and(eq(syncJobs.id, claimed.id), eq(syncJobs.status, "processing"), eq(syncJobs.lockedAt, claimed.lockedAt)))
      .returning({ id: syncJobs.id });
    if (!saved) throw new Error("Manual sync lease expired");
    if (completed && request.source === "signup" && result.failed.length === 0) {
      await db.update(users).set({ lastScheduledSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, claimed.userId));
    }
    return { processed: 1, id: claimed.id, status: finalStatus, attempted: attempted.length, remaining: batch.deferred + (retrySignup ? retryableIds.size : 0) };
  } catch (error) {
    const signupNotReady = request.source === "signup" && error instanceof OpenDotaError &&
      error.code === "opendota_player_not_found" && Date.now() < claimed.jobCreatedAt.getTime() + signupRetryDeadlineMs;
    const transient = error instanceof OpenDotaError && (error.status === 429 || error.status >= 500 || signupNotReady);
    const retries = claimed.attempts + 1;
    const canRetry = transient && retries < 30;
    await db.update(syncJobs).set({manualResult:{...previous,externalRequests:(previous.externalRequests||0)+externalRequests}, status: canRetry ? "pending" : "failed", lockedAt: null,
      runAfter: new Date(Date.now() + Math.max(signupNotReady ? 900 : 90, error instanceof OpenDotaError ? error.retryAfterSeconds || 0 : 0) * 1_000),
      finishedAt: canRetry ? null : new Date(), errorMessage: error instanceof OpenDotaError ? error.code : "manual_sync_failed" })
      .where(and(eq(syncJobs.id, claimed.id), eq(syncJobs.status, "processing"), eq(syncJobs.lockedAt, claimed.lockedAt)));
    return { processed: 1, id: claimed.id, status: canRetry ? "pending" : "failed", errorCode: error instanceof OpenDotaError ? error.code : "manual_sync_failed" };
  }
}
