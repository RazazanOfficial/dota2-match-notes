import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HEROES, heroImage, heroPortraitFileName } from "../data/heroes";

describe("local hero portraits", () => {
  it("keeps every configured hero portrait inside public/heroes", async () => {
    expect(HEROES.length).toBeGreaterThan(120);
    await Promise.all(
      HEROES.map(async (hero) => {
        expect(heroImage(hero)).toBe(`/heroes/${hero.slug}.png`);
        await expect(
          access(path.join(process.cwd(), "public", "heroes", heroPortraitFileName(hero))),
        ).resolves.toBeUndefined();
      }),
    );
  });
});
