export interface MatchImageConfig {
  assetTimeoutMs: number;
  assetMaxBytes: number;
  webpQuality: number;
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

export function getMatchImageConfig(): MatchImageConfig {
  return {
    assetTimeoutMs: parseInteger(
      "MATCH_IMAGE_ASSET_TIMEOUT_MS",
      5_000,
      1_000,
      15_000,
    ),
    assetMaxBytes: parseInteger(
      "MATCH_IMAGE_ASSET_MAX_BYTES",
      1_572_864,
      65_536,
      5_242_880,
    ),
    webpQuality: parseInteger("MATCH_IMAGE_WEBP_QUALITY", 88, 60, 100),
  };
}
