import { describe, expect, it } from "vitest";
import { defaultPreferences, readPreferences, resolveAppearance } from "../src";

describe("persisted preferences", () => {
  it("recovers corrupted and older preference records without breaking startup", () => {
    for (const value of [null, "{bad", "null", "17", '"text"']) expect(readPreferences(value)).toEqual(defaultPreferences);
    expect(readPreferences('{"language":"fa","theme":"removed-theme","appearance":"dark"}')).toEqual({ language: "fa", theme: "obsidian", appearance: "dark" });
  });
  it("keeps palette, language and appearance independent", () => {
    expect(readPreferences('{"language":"fa","theme":"nebula","appearance":"system"}')).toEqual({ language: "fa", theme: "nebula", appearance: "system" });
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });
});
