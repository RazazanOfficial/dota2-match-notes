import { OpenDotaError } from "@/lib/opendota/errors";
import { syncScheduledMatchesFromOpenDota } from "@/lib/opendota/service";
import { getSyncWorkerConfig } from "./config";
import { scheduledSyncUserFromJob } from "./job";
import {
  claimNextScheduledSyncJob,
  completeScheduledSyncJob,
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

  console.error("Scheduled sync job failed", error);
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
  const enqueued = await enqueueDueScheduledSyncJobs(config);
  const jobs: Array<Record<string, unknown>> = [];
  let stoppedEarly = false;

  for (let index = 0; index < config.processBatchSize; index += 1) {
    const job = await claimNextScheduledSyncJob();
    if (!job) break;

    try {
      const sync = await syncScheduledMatchesFromOpenDota(
        scheduledSyncUserFromJob(job),
        {
          lookbackSeconds: config.lookbackSeconds,
          initialMatches: config.initialMatches,
        },
      );
      await completeScheduledSyncJob(job);
      jobs.push({
        id: job.id,
        userId: job.userId,
        status: "completed",
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
    enqueued,
    stale,
    processed: jobs.length,
    stoppedEarly,
    jobs,
  };
}
