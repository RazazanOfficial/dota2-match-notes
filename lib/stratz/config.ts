import { isIP } from "node:net";

export interface StratzConfig {
  endpoint: string;
  token: string;
  timeoutMs: number;
  maxResponseBytes: number;
  diagnosticsEnabled: boolean;
  directIp: string;
  retryDelayMs: number;
  maxAttempts: number;
  minRequestIntervalMs: number;
  backfillOnManualSync: boolean;
  inlineProcessBatchSize: number;
  processBatchSize: number;
  staleLockSeconds: number;
  jobMaxAttempts: number;
  jobRetryBaseSeconds: number;
}

const DEFAULT_ENDPOINT = "https://api.stratz.com/graphql";

function parseInteger(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid env: ${name}`);
  }
  return value;
}

function parseEndpoint() {
  const raw = process.env.STRATZ_API_URL?.trim() || DEFAULT_ENDPOINT;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.search || url.hash) {
    throw new Error("Invalid env: STRATZ_API_URL");
  }
  return url.toString().replace(/\/+$/, "");
}

function isPublicIpv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

function parseBoolean(name: string, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid env: ${name}`);
}

function parseDirectIp() {
  const address = process.env.STRATZ_DIRECT_IP?.trim();
  if (!address || !isPublicIpv4(address)) {
    throw new Error("Invalid env: STRATZ_DIRECT_IP");
  }
  return address;
}

export function getStratzConfig(): StratzConfig {
  const token = process.env.STRATZ_API_TOKEN?.trim();
  if (!token) throw new Error("Missing env: STRATZ_API_TOKEN");

  return {
    endpoint: parseEndpoint(),
    token,
    timeoutMs: parseInteger("STRATZ_TIMEOUT_MS", 20_000, 1_000, 30_000),
    maxResponseBytes: parseInteger(
      "STRATZ_MAX_RESPONSE_BYTES",
      2 * 1024 * 1024,
      64 * 1024,
      8 * 1024 * 1024,
    ),
    diagnosticsEnabled: parseBoolean("STRATZ_DIAGNOSTICS_ENABLED"),
    directIp: parseDirectIp(),
    retryDelayMs: parseInteger("STRATZ_RETRY_DELAY_MS", 2_000, 1_000, 10_000),
    maxAttempts: parseInteger("STRATZ_MAX_ATTEMPTS", 2, 1, 2),
    minRequestIntervalMs: parseInteger(
      "STRATZ_MIN_REQUEST_INTERVAL_MS",
      1_000,
      1_000,
      60_000,
    ),
    backfillOnManualSync: parseBoolean("STRATZ_BACKFILL_ON_MANUAL_SYNC"),
    inlineProcessBatchSize: parseInteger(
      "STRATZ_INLINE_PROCESS_BATCH_SIZE",
      3,
      0,
      10,
    ),
    processBatchSize: parseInteger("STRATZ_PROCESS_BATCH_SIZE", 10, 1, 50),
    staleLockSeconds: parseInteger("STRATZ_STALE_LOCK_SECONDS", 900, 60, 3_600),
    jobMaxAttempts: parseInteger("STRATZ_JOB_MAX_ATTEMPTS", 6, 1, 20),
    jobRetryBaseSeconds: parseInteger(
      "STRATZ_JOB_RETRY_BASE_SECONDS",
      120,
      10,
      7_200,
    ),
  };
}
