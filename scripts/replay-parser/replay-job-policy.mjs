export function retryDelay(attempts, retryAfter = null, random = Math.random) {
  const delays = [60, 120, 300, 600, 1200, 1800];
  const base = delays[Math.min(delays.length - 1, Math.max(0, attempts - 1))];
  return Math.max(retryAfter || 0, Math.round(base * (1 + random() * 0.1)));
}
export function retryDecision(error, job, now = Date.now(), random = Math.random) {
  if (error.retryable === false) return { status: "failed", delay: 0, code: error.code };
  const deadline = new Date(job.retry_deadline_at).getTime();
  const metadataWaiting = error.code === "replay_metadata_pending" || error.code === "replay_metadata_rate_limited" || error.code === "replay_metadata_unavailable";
  // A brief connection failure gets one quicker retry. Provider rate limits
  // and later failures retain their normal backoff.
  const firstConnectFailure = Number(job.attempts) === 1 &&
    (error.code === "replay_connect_failed" || error.code === "replay_connect_timeout") && !error.retryAfter;
  const delay = metadataWaiting ? Math.max(600, error.retryAfter || 0) : firstConnectFailure ? 20 + Math.round(random() * 5)
    : retryDelay(Number(job.attempts), error.retryAfter, random);
  if (!Number.isFinite(deadline) || now >= deadline || now + delay * 1000 >= deadline) {
    return { status: "failed", delay: 0, code: "replay_retry_exhausted" };
  }
  return { status: "pending", delay, code: error.code || "replay_processing_failed" };
}
export function processingPlan({ archived, parsed, intent, checkpoint }) {
  if (archived && (intent === "download" || parsed)) return "complete";
  if (checkpoint) return "use-checkpoint";
  return archived ? "restore-archive" : "download";
}
