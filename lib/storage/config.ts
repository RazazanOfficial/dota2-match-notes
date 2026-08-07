export interface StorageConfig {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  accessKey: string;
  secretKey: string;
  region: string;
  forcePathStyle: boolean;
  presignTtlSeconds: number;
  maxImageBytes: number;
}

const DEFAULT_PRESIGN_TTL_SECONDS = 300;
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
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

function normalizeUrl(value: string, name: string) {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (!/^https?:$/.test(url.protocol) || url.search || url.hash) {
    throw new Error(`Invalid env: ${name}`);
  }
  return url.toString().replace(/\/+$/, "");
}

export function getStorageConfig(): StorageConfig {
  const bucket = required("CLOUD_SPACE_BUCKET");
  if (bucket.includes("/") || bucket.includes("://")) {
    throw new Error("Invalid env: CLOUD_SPACE_BUCKET");
  }

  return {
    endpoint: normalizeUrl(
      required("CLOUD_SPACE_END_POINT_URL"),
      "CLOUD_SPACE_END_POINT_URL",
    ),
    bucket,
    publicBaseUrl: normalizeUrl(
      required("CLOUD_SPACE_PUBLIC_BASE_URL"),
      "CLOUD_SPACE_PUBLIC_BASE_URL",
    ),
    accessKey: required("CLOUD_SPACE_ACCESS_KEY"),
    secretKey: required("CLOUD_SPACE_SECRET_KEY"),
    region: process.env.CLOUD_SPACE_REGION?.trim() || "us-east-1",
    forcePathStyle: process.env.CLOUD_SPACE_FORCE_PATH_STYLE !== "false",
    presignTtlSeconds: parseInteger(
      "MEDIA_PRESIGN_TTL_SECONDS",
      DEFAULT_PRESIGN_TTL_SECONDS,
      60,
      900,
    ),
    maxImageBytes: parseInteger(
      "MATCH_IMAGE_MAX_BYTES",
      DEFAULT_MAX_IMAGE_BYTES,
      1,
      25 * 1024 * 1024,
    ),
  };
}
