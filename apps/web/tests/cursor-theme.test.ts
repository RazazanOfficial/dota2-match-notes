import { describe, expect, it } from "vitest";
import {
  CURSOR_EFFECTS,
  CURSOR_PACKS,
  isCursorEffectId,
  isCursorPackId,
} from "../lib/cursor-theme";

describe("cursor theme contracts", () => {
  it("ships seven complete selectable packs", () => {
    expect(CURSOR_PACKS).toHaveLength(7);
    expect(new Set(CURSOR_PACKS.map((pack) => pack.id)).size).toBe(7);
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
