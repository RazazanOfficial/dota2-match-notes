export interface MatchImageJobConfig {
  processBatchSize: number;
  staleLockSeconds: number;
  maxAttempts: number;
  retryBaseSeconds: number;
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

export function getMatchImageJobConfig(): MatchImageJobConfig {
  return {
    processBatchSize: parseInteger(
      "MATCH_IMAGE_PROCESS_BATCH_SIZE",
      1,
      1,
      3,
    ),
    staleLockSeconds: parseInteger(
      "MATCH_IMAGE_STALE_LOCK_SECONDS",
      900,
      60,
      3_600,
    ),
    maxAttempts: parseInteger("MATCH_IMAGE_MAX_ATTEMPTS", 3, 1, 10),
    retryBaseSeconds: parseInteger(
      "MATCH_IMAGE_RETRY_BASE_SECONDS",
      60,
      10,
      3_600,
    ),
  };
}
