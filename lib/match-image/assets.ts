import { heroById, heroImage } from "../../data/heroes";
import type { MatchImageConfig } from "./config";

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function contentType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || "";
}

export type HeroPortraitLoader = (
  heroId: number,
) => Promise<string | null>;

async function readBoundedBody(response: Response, maximumBytes: number) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) return null;
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export function createHeroPortraitLoader(
  config: MatchImageConfig,
): HeroPortraitLoader {
  const cache = new Map<number, Promise<string | null>>();

  async function load(heroId: number) {
    const hero = heroById(heroId);
    if (!hero) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.assetTimeoutMs);
    try {
      const response = await fetch(heroImage(hero), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const mimeType = contentType(response.headers.get("content-type"));
      if (!SUPPORTED_TYPES.has(mimeType)) return null;
      const declaredSize = Number(response.headers.get("content-length") || 0);
      if (declaredSize > config.assetMaxBytes) return null;

      const bytes = await readBoundedBody(response, config.assetMaxBytes);
      if (!bytes) return null;
      return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return (heroId) => {
    const cached = cache.get(heroId);
    if (cached) return cached;
    const pending = load(heroId);
    cache.set(heroId, pending);
    return pending;
  };
}
