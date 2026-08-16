export interface OpenDotaConfig {
  baseUrl: string;
  apiKey: string | null;
  timeoutMs: number;
  maxResponseBytes: number;
  manualSyncCooldownSeconds: number;
  minuteRequestLimit: number;
  dailyRequestLimit: number;
  maxNewMatchesPerSync: number;
}

const DEFAULT_BASE_URL = "https://api.opendota.com/api";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MANUAL_SYNC_COOLDOWN_SECONDS = 300;
const DEFAULT_MINUTE_REQUEST_LIMIT = 50;
const DEFAULT_DAILY_REQUEST_LIMIT = 2_900;
const DEFAULT_MAX_NEW_MATCHES_PER_SYNC = 3;

function parseInteger(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid env: ${name}`);
  }
  return value;
}

function parseBaseUrl() {
  const value = process.env.OPENDOTA_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.search || url.hash) {
    throw new Error("Invalid env: OPENDOTA_API_BASE_URL");
  }
  return url.toString().replace(/\/+$/, "");
}

export function getOpenDotaConfig(): OpenDotaConfig {
  return {
    baseUrl: parseBaseUrl(),
    apiKey: process.env.OPENDOTA_API_KEY?.trim() || null,
    timeoutMs: parseInteger(
      "OPENDOTA_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      1_000,
      30_000,
    ),
    maxResponseBytes: parseInteger(
      "OPENDOTA_MAX_RESPONSE_BYTES",
      DEFAULT_MAX_RESPONSE_BYTES,
      64 * 1024,
      25 * 1024 * 1024,
    ),
    manualSyncCooldownSeconds: parseInteger(
      "OPENDOTA_MANUAL_SYNC_COOLDOWN_SECONDS",
      DEFAULT_MANUAL_SYNC_COOLDOWN_SECONDS,
      5,
      3_600,
    ),
    minuteRequestLimit: parseInteger(
      "OPENDOTA_MINUTE_REQUEST_LIMIT",
      DEFAULT_MINUTE_REQUEST_LIMIT,
      1,
      3_000,
    ),
    dailyRequestLimit: parseInteger(
      "OPENDOTA_DAILY_REQUEST_LIMIT",
      DEFAULT_DAILY_REQUEST_LIMIT,
      1,
      1_000_000,
    ),
    maxNewMatchesPerSync: parseInteger(
      "OPENDOTA_MAX_NEW_MATCHES_PER_SYNC",
      DEFAULT_MAX_NEW_MATCHES_PER_SYNC,
      1,
      20,
    ),
  };
}
