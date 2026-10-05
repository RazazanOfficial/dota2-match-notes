import { describe, expect, it } from "vitest";
import {
  normalizePlayerSearchQuery,
  PLAYER_SEARCH_MAX_LENGTH,
  PLAYER_SEARCH_MIN_LENGTH,
  PLAYER_SEARCH_RESULT_LIMIT,
} from "../lib/player-search/validation";

describe("public player search", () => {
  it("normalizes user input without changing Steam display-name casing", () => {
    expect(normalizePlayerSearchQuery("  MeriJ   Player  ")).toBe("MeriJ Player");
  });

  it("keeps conservative realtime search limits", () => {
    expect(PLAYER_SEARCH_MIN_LENGTH).toBe(2);
    expect(PLAYER_SEARCH_MAX_LENGTH).toBe(64);
    expect(PLAYER_SEARCH_RESULT_LIMIT).toBe(8);
  });
});
