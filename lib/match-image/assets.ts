import { readFile } from "node:fs/promises";
import path from "node:path";
import { heroById, heroPortraitFileName } from "../../data/heroes";
import type { MatchImageConfig } from "./config";

export type HeroPortraitLoader = (
  heroId: number,
) => Promise<string | null>;

export function createHeroPortraitLoader(
  config: MatchImageConfig,
): HeroPortraitLoader {
  const cache = new Map<number, Promise<string | null>>();

  async function load(heroId: number) {
    const hero = heroById(heroId);
    if (!hero) return null;

    try {
      const portraitPath = path.join(
        process.cwd(),
        "public",
        "heroes",
        heroPortraitFileName(hero),
      );
      const bytes = await readFile(portraitPath);
      if (!bytes.byteLength || bytes.byteLength > config.assetMaxBytes) return null;
      return `data:image/png;base64,${bytes.toString("base64")}`;
    } catch {
      return null;
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
