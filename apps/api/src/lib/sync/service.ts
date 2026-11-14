import {runObservedMatchTick} from "./companion";
import { logFailure } from "../../http/log";
import { OpenDotaError } from "../opendota/errors";
import { fetchSelectedHistory, syncManualRangeBatch } from "../opendota/service";
import { toJournalDateKey } from "../journal/timezone";
import { getSyncWorkerConfig } from "./config";
import { runManualRangeSyncTick } from "./manual-service";
import {
  claimNextScheduledSyncJob,
  completeScheduledSyncJob,
  continueScheduledSyncJob,
  enqueueDueScheduledSyncJobs,
  recoverStaleScheduledJobs,
  rescheduleOrFailScheduledSyncJob,
} from "./repository";

function describeWorkerError(error: unknown) {
  if (error instanceof OpenDotaError) {
    return {
      code: error.code,
      message: `${error.code}: ${error.message}`,
      retryAfterSeconds: error.retryAfterSeconds,
      stopWorker: error.status === 429 || error.status >= 500,
    };
  }

  logFailure("Scheduled sync job failed", error);
  return {
    code: "scheduled_sync_failed",
    message: "scheduled_sync_failed: unexpected worker error",
    retryAfterSeconds: undefined,
    stopWorker: false,
  };
}

export async function runScheduledSyncTick() {
  const config = getSyncWorkerConfig();
  const stale = await recoverStaleScheduledJobs(config);
  const observed = await runObservedMatchTick();
  const manual = await runManualRangeSyncTick();
  if (!config.enabled) {
    return {
      enabled: false,
      enqueued: 0,
      stale,
      processed: 0,
      stoppedEarly: false,
      jobs: [],
      manual, observed,
    };
  }

  const enqueued = await enqueueDueScheduledSyncJobs(config);
  const jobs: Array<Record<string, unknown>> = [];
  let stoppedEarly = false;

  for (let index = 0; index < config.processBatchSize; index += 1) {
    const job = await claimNextScheduledSyncJob();
    if (!job) break;

    try {
      const cursor = job.lastScheduledSyncAt || job.lastManualSyncAt;
      const cutoff = cursor
        ? new Date(cursor.getTime() - config.lookbackSeconds * 1_000)
        : new Date(job.createdAt.getTime() - 3 * 86_400_000);
      const user = { id: job.userId, steamAccountId: job.steamAccountId, createdAt: job.createdAt };
      const range = { from: toJournalDateKey(cutoff), to: toJournalDateKey(job.createdAt) };
      const snapshot = job.snapshot || await fetchSelectedHistory(user, range);
      const eligible = snapshot.filter(match =>
        match.start_time * 1_000 >= cutoff.getTime() &&
        match.start_time * 1_000 <= job.createdAt.getTime());
      const sync = await syncManualRangeBatch(user,
        { scope: "week", ...range, mode: "basic" }, job.attempted, 20, eligible);
      if (sync.deferred > 0) {
        await continueScheduledSyncJob(job, snapshot,
          [...job.attempted, ...sync.attemptedIds]);
      } else {
        await completeScheduledSyncJob(job);
      }
      jobs.push({
        id: job.id,
        userId: job.userId,
        status: sync.deferred > 0 ? "pending" : "completed",
        attempts: job.attempts,
        sync,
      });
    } catch (error) {
      const failure = describeWorkerError(error);
      const outcome = await rescheduleOrFailScheduledSyncJob({
        job,
        config,
        errorMessage: failure.message,
        retryAfterSeconds: failure.retryAfterSeconds,
      });
      jobs.push({
        id: job.id,
        userId: job.userId,
        status: outcome.status,
        attempts: job.attempts,
        errorCode: failure.code,
        runAfter: outcome.runAfter?.toISOString() || null,
      });
      if (failure.stopWorker) {
        stoppedEarly = true;
        break;
      }
    }
  }

  return {
    enabled: true,
    enqueued,
    stale,
    processed: jobs.length,
    stoppedEarly,
    jobs,
    manual, observed,
  };
}
