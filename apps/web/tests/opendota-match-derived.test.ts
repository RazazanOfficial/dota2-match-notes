import { describe, expect, it } from "vitest";
import { estimatedOpenDotaRole, openDotaDraft } from "../lib/opendota/match-derived";

const players = Array.from({ length: 10 }, (_, index) => ({
  player_slot: index < 5 ? index : 128 + index - 5,
  hero_id: index + 1,
  account_id: 100 + index,
  position_est: index % 5 + 1,
}));
const match = { match_id: 9008411473, start_time: 1_700_000_000, duration: 2400,
  radiant_win: true, players };

describe("match data without per-match STRATZ", () => {
  it("uses only OpenDota position estimates and rejects missing estimates", () => {
    expect(estimatedOpenDotaRole(match, 100)).toBe("safe_lane");
    expect(estimatedOpenDotaRole({ ...match, players: players.map(({ position_est: _, ...player }) => player) }, 100)).toBeNull();
  });

  it("takes nine final picks and excludes invalid, duplicated or actually picked bans", () => {
    const draft = openDotaDraft({ ...match, picks_bans: [
      { is_pick: false, hero_id: 11, team: 0, order: 3 },
      { is_pick: false, hero_id: 11, team: 0, order: 4 },
      { is_pick: false, hero_id: 1, team: 1, order: 5 },
      { is_pick: true, hero_id: 12, team: 1, order: 6 },
    ] }, 1);
    expect(draft.picks).toHaveLength(9);
    expect(draft.picks.some((pick) => pick.id === 1)).toBe(false);
    expect(draft.bans.map((ban) => ban.id)).toEqual([11]);
  });
});
