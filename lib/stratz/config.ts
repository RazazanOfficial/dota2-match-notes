export interface StratzConfig {
  endpoint: string;
  token: string;
  timeoutMs: number;
  maxResponseBytes: number;
  diagnosticsEnabled: boolean;
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
    diagnosticsEnabled: process.env.STRATZ_DIAGNOSTICS_ENABLED?.trim() === "true",
  };
}
