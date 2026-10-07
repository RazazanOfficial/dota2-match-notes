export interface SyncWorkerConfig {
  secret: string;
  enabled: boolean;
  intervalSeconds: number;
  enqueueBatchSize: number;
  processBatchSize: number;
  staleLockSeconds: number;
  maxAttempts: number;
  retryBaseSeconds: number;
  lookbackSeconds: number;
  initialMatches: number;
}

function parseToggle(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "on" || raw === "true") return true;
  if (raw === "off" || raw === "false") return false;
  throw new Error(`Invalid env: ${name}`);
}

function parseInteger(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid env: ${name}`);
  }
  return value;
}

function getWorkerSecret() {
  const secret = process.env.SYNC_WORKER_SECRET?.trim() || "";
  if (!/^[A-Za-z0-9._~-]{32,512}$/.test(secret)) {
    throw new Error("Invalid env: SYNC_WORKER_SECRET");
  }
  return secret;
}

export function getSyncWorkerConfig(): SyncWorkerConfig {
  return {
    secret: getWorkerSecret(),
    enabled: parseToggle("SCHEDULED_SYNC_ENABLED", false),
    intervalSeconds: parseInteger(
      "SCHEDULED_SYNC_INTERVAL_SECONDS",
      3_600,
      300,
      604_800,
    ),
    enqueueBatchSize: parseInteger(
      "SCHEDULED_SYNC_ENQUEUE_BATCH_SIZE",
      25,
      1,
      500,
    ),
    processBatchSize: parseInteger(
      "SCHEDULED_SYNC_PROCESS_BATCH_SIZE",
      1,
      1,
      10,
    ),
    staleLockSeconds: parseInteger(
      "SCHEDULED_SYNC_STALE_LOCK_SECONDS",
      900,
      60,
      3_600,
    ),
    maxAttempts: parseInteger(
      "SCHEDULED_SYNC_MAX_ATTEMPTS",
      3,
      1,
      10,
    ),
    retryBaseSeconds: parseInteger(
      "SCHEDULED_SYNC_RETRY_BASE_SECONDS",
      60,
      10,
      3_600,
    ),
    lookbackSeconds: parseInteger(
      "SCHEDULED_SYNC_LOOKBACK_SECONDS",
      21_600,
      300,
      86_400,
    ),
    initialMatches: parseInteger(
      "SCHEDULED_SYNC_INITIAL_MATCHES",
      1,
      0,
      3,
    ),
  };
}
