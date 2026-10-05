import { describe, expect, it } from "vitest";
import {
  CURSOR_EFFECTS,
  CURSOR_PACKS,
  DEFAULT_CURSOR_PACK,
  isCursorEffectId,
  isCursorPackId,
} from "../lib/cursor-theme";

describe("cursor theme contracts", () => {
  it("offers the system cursor and seven complete custom packs", () => {
    expect(CURSOR_PACKS).toHaveLength(8);
    expect(new Set(CURSOR_PACKS.map((pack) => pack.id)).size).toBe(8);
    expect(DEFAULT_CURSOR_PACK).toBe("system");
  });

  it("accepts only known cursor packs", () => {
    expect(isCursorPackId("ti-2019")).toBe(true);
    expect(isCursorPackId("unknown-pack")).toBe(false);
    expect(isCursorPackId(null)).toBe(false);
  });

  it("supports no effect plus the three streak auras", () => {
    expect(CURSOR_EFFECTS.map((effect) => effect.id)).toEqual([
      "none",
      "gold",
      "fire",
      "ice",
    ]);
    expect(isCursorEffectId("fire")).toBe(true);
    expect(isCursorEffectId("smoke")).toBe(false);
  });
});
