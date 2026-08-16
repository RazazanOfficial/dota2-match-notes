import { describe, expect, it } from "vitest";
import { gameModeName, lobbyTypeName } from "../lib/dota/modes";
import { collectDismissedDotaMatchIds } from "../lib/journal/dismissed";
import { excludeKnownRecentMatches } from "../lib/opendota/recent";

describe("Dota match metadata", () => {
  it("names common ranked, turbo and draft modes without guessing rank", () => {
    expect(gameModeName(22)).toBe("All Draft");
    expect(gameModeName(23)).toBe("Turbo");
    expect(gameModeName(4)).toBe("Single Draft");
    expect(lobbyTypeName(7)).toBe("Ranked");
    expect(lobbyTypeName(0)).toBe("Normal");
  });

  it("keeps unknown future identifiers visible", () => {
    expect(gameModeName(99)).toBe("Unknown (99)");
    expect(lobbyTypeName(null)).toBeNull();
  });
});

describe("dismissed automatic matches", () => {
  it("records only removed matches that are linked to Dota", () => {
    const dismissed = collectDismissedDotaMatchIds(
      [
        { id: "kept", dotaMatchId: 8_900_000_001 },
        { id: "removed-auto", dotaMatchId: 8_900_000_002 },
        { id: "removed-manual", dotaMatchId: null },
      ],
      new Set(["kept"]),
    );

    expect(dismissed).toEqual([8_900_000_002]);
  });

  it("excludes imported and user-dismissed matches from discovery", () => {
    const recent = [1, 2, 3].map((matchId) => ({
      match_id: matchId,
      player_slot: 0,
      radiant_win: true,
      duration: 1_800,
      hero_id: 1,
      start_time: 1_786_000_000 + matchId,
    }));

    expect(
      excludeKnownRecentMatches(recent, new Set([1]), new Set([2])).map(
        (match) => match.match_id,
      ),
    ).toEqual([3]);
  });
});
