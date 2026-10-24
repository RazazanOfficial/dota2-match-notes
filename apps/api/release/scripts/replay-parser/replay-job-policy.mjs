export const MAX_NETWORK_ATTEMPTS=6;
export const MAX_METADATA_ATTEMPTS=12;
export const MAX_ARCHIVE_ATTEMPTS=8;
export const RETRY_WINDOW_MS=24*60*60*1000;
export const metadataError=code=>["replay_metadata_pending","replay_metadata_rate_limited","replay_metadata_unavailable","replay_metadata_cooldown"].includes(code);
export function retryDelay(attempts, retryAfter = null, random = Math.random) {
  const delays = [60, 120, 300, 600, 1200, 1800];
  const base = delays[Math.min(delays.length - 1, Math.max(0, attempts - 1))];
  return Math.max(retryAfter || 0, Math.round(base * (1 + random() * 0.1)));
}
export function retryDecision(error, job, now = Date.now(), random = Math.random) {
  if (error.retryable === false) return { status: "failed", delay: 0, code: error.code };
  const deadline = new Date(job.retry_deadline_at).getTime();
  const metadataWaiting=metadataError(error.code);
  const started=new Date(job.request_started_at || now).getTime();
  const limit=metadataWaiting?MAX_METADATA_ATTEMPTS:MAX_NETWORK_ATTEMPTS;
  if(Number(job.attempts)>=limit)return {status:"failed",delay:0,code:metadataWaiting?"replay_metadata_attempts_exhausted":"replay_attempts_exhausted"};
  const effectiveDeadline=Math.min(deadline,Number.isFinite(started)?started+RETRY_WINDOW_MS:deadline);
  // A brief connection failure gets one quicker retry. Provider rate limits
  // and later failures retain their normal backoff.
  const firstConnectFailure = Number(job.attempts) === 1 &&
    (error.code === "replay_connect_failed" || error.code === "replay_connect_timeout") && !error.retryAfter;
  const metadataDelays=[600,900,1800,3600,7200,14400];
  const delay = metadataWaiting ? Math.max(metadataDelays[Math.min(metadataDelays.length-1,Math.max(0,Number(job.attempts)-1))],error.retryAfter || 0) : firstConnectFailure ? 20 + Math.round(random() * 5)
    : retryDelay(Number(job.attempts), error.retryAfter, random);
  if (!Number.isFinite(deadline) || now >= effectiveDeadline || now + delay * 1000 >= effectiveDeadline) {
    return { status: "failed", delay: 0, code: "replay_retry_exhausted" };
  }
  return { status: "pending", delay, code: error.code || "replay_processing_failed" };
}
export function processingPlan({ archived, parsed, intent, checkpoint }) {
  if (archived && (intent === "download" || parsed)) return "complete";
  if (checkpoint) return "use-checkpoint";
  return archived ? "restore-archive" : "download";
}
