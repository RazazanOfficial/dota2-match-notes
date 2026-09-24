import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { heroById } from "../data/heroes";
import BanPicker from "../components/BanPicker";

describe("ban display", () => {
  it("shows imported bans without any control to add or remove one", () => {
    const hero = heroById(2)!;
    const html = renderToStaticMarkup(<BanPicker value={[{ ...hero, source: "opendota" }]} picks={[]} />);
    expect(html).toContain(hero.name);
    expect(html).toContain("OpenDota");
    expect(html).not.toMatch(/<(?:button|input|select)\b/);
  });
});
