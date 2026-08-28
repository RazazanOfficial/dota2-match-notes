import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOTA_ITEMS, itemImage } from "../data/items.generated";

describe("local match-detail assets", () => {
  it("keeps every generated item reference on the local origin", async () => {
    const uniqueSlugs = [...new Set(DOTA_ITEMS.map((item) => item.slug))];
    expect(DOTA_ITEMS.length).toBeGreaterThan(450);
    expect(uniqueSlugs.length).toBeGreaterThan(400);

    await Promise.all(uniqueSlugs.map(async (slug) => {
      const bytes = await readFile(path.join(process.cwd(), "public", "items", `${slug}.png`));
      expect(bytes.byteLength).toBeGreaterThan(255);
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }));

    expect(itemImage(DOTA_ITEMS[0].id)).toBe(`/items/${DOTA_ITEMS[0].slug}.png`);
  });

  it("ships the exact team, gold and four inventory-frame states", async () => {
    const assets = [
      "radiant.webp",
      "dire.webp",
      "gold.png",
      "inventory-none.png",
      "inventory-shard.png",
      "inventory-scepter.png",
      "inventory-scepter-shard.png",
    ];

    await Promise.all(assets.map(async (name) => {
      const bytes = await readFile(path.join(process.cwd(), "public", "match-details", name));
      expect(bytes.byteLength).toBeGreaterThan(1_000);
    }));
  });
});
