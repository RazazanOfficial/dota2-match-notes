import { isIP } from "node:net";

export interface StratzConfig {
  endpoint: string;
  token: string;
  timeoutMs: number;
  maxResponseBytes: number;
  diagnosticsEnabled: boolean;
  directIps: string[];
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

function parseDirectIps() {
  const raw = process.env.STRATZ_DIRECT_IPS?.trim();
  if (!raw) return [];
  const addresses = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
  if (!addresses.length || addresses.length > 8 || addresses.some((address) => !isPublicIpv4(address))) {
    throw new Error("Invalid env: STRATZ_DIRECT_IPS");
  }
  return addresses;
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
    directIps: parseDirectIps(),
  };
}
