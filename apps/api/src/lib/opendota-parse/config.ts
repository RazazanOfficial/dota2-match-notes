export interface OpenDotaParseConfig {
  enabled: boolean;
  processBatchSize: number;
  staleLockSeconds: number;
  pollIntervalSeconds: number;
  maxPollAttempts: number;
  maxAttempts: number;
  retryBaseSeconds: number;
}

function integer(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid env: ${name}`);
  return value;
}

function toggle(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid env: ${name}`);
}

export function getOpenDotaParseConfig(): OpenDotaParseConfig {
  return {
    enabled: toggle("OPENDOTA_PARSE_ENABLED", true),
    processBatchSize: integer("OPENDOTA_PARSE_PROCESS_BATCH_SIZE", 2, 1, 10),
    staleLockSeconds: integer("OPENDOTA_PARSE_STALE_LOCK_SECONDS", 300, 60, 3_600),
    pollIntervalSeconds: integer("OPENDOTA_PARSE_POLL_INTERVAL_SECONDS", 45, 15, 300),
    maxPollAttempts: integer("OPENDOTA_PARSE_MAX_POLL_ATTEMPTS", 40, 3, 120),
    maxAttempts: integer("OPENDOTA_PARSE_MAX_ATTEMPTS", 5, 1, 12),
    retryBaseSeconds: integer("OPENDOTA_PARSE_RETRY_BASE_SECONDS", 60, 15, 3_600),
  };
}
