import { describe, expect, it } from "vitest";
import { heroPoolSizeState, isHeroPoolEligibleMode } from "../lib/hero-pool/rules";

describe("hero pool rules", () => {
  it("blocks Single Draft and accepts the reviewed matchmaking modes", () => {
    expect(isHeroPoolEligibleMode(4, 7)).toBe(false);
    expect(isHeroPoolEligibleMode(1, 0)).toBe(true);
    expect(isHeroPoolEligibleMode(2, 2)).toBe(true);
    expect(isHeroPoolEligibleMode(22, 7)).toBe(true);
    expect(isHeroPoolEligibleMode(23, 0)).toBe(true);
    expect(isHeroPoolEligibleMode(3, 0)).toBe(false);
  });

  it("grades two through eight without allowing an unbounded pool", () => {
    expect(heroPoolSizeState(2)).toBe("minimum");
    expect(heroPoolSizeState(3)).toBe("ideal");
    expect(heroPoolSizeState(5)).toBe("ideal");
    expect(heroPoolSizeState(6)).toBe("caution");
    expect(heroPoolSizeState(8)).toBe("overload");
  });
});
