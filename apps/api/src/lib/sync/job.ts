export function scheduledSyncUserFromJob(job: {
  userId: string;
  steamAccountId: number;
  lastManualSyncAt: Date | null;
  lastScheduledSyncAt: Date | null;
}) {
  return {
    id: job.userId,
    steamAccountId: job.steamAccountId,
    lastManualSyncAt: job.lastManualSyncAt,
    lastScheduledSyncAt: job.lastScheduledSyncAt,
  };
}
