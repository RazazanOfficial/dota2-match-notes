import { describe, expect, it } from "vitest";
import { validateReplayIdentity, type ReplayIdentity } from "../scripts/replay-identity";
import { HEROES } from "../src/data/heroes";
const matchId = 9028060850;
const summary = { match_id: matchId, game_mode: 22, radiant_win: true,
  players: Array.from({ length: 10 }, (_, i) => ({ hero_id: HEROES[i].id, player_slot: i < 5 ? i : i + 123, account_id: 1000 + i })) };
const metadata = (): ReplayIdentity => ({ matchIds: ["0"], gameMode: 22, winner: 2,
  players: summary.players.map((p, i) => ({ hero: `npc_dota_hero_${HEROES[i].slug}`, team: p.player_slot < 128 ? 2 : 3, steamId: (76561197960265728n + BigInt(p.account_id)).toString(), fake: false })) });
describe("replay identity without an embedded match ID", () => {
  it("accepts the complete matching roster without relying on player order", () => {
    const replay = metadata(); replay.players.reverse();
    expect(validateReplayIdentity(replay, summary, matchId)).toBe("verified-roster");
  });
  it("normalizes Valve class names without accepting different heroes", () => {
    const replay = metadata();
    replay.players.forEach((p, i) => { p.hero = `CDOTA_Unit_Hero_${HEROES[i].slug.replaceAll("_", "")}`; });
    expect(validateReplayIdentity(replay, summary, matchId)).toBe("verified-roster");
  });
  it("accepts a verified embedded ID and ignores a later zero placeholder", () => {
    const replay = metadata(); replay.matchIds = [String(matchId), "0"];
    expect(validateReplayIdentity(replay, summary, matchId)).toBe("embedded-id");
  });
  it("rejects a conflicting nonzero ID even when the participants match", () => {
    const replay = metadata(); replay.matchIds = [String(matchId), "9028060851"];
    expect(() => validateReplayIdentity(replay, summary, matchId)).toThrow("another match");
  });
  it.each(["hero", "team", "steamId", "fake"])("rejects a changed %s in a zero-ID replay", key => {
    const replay = metadata();
    if (key === "hero") replay.players[0].hero = "npc_dota_hero_mirana";
    if (key === "team") replay.players[0].team = 3;
    if (key === "steamId") replay.players[0].steamId = "76561198000000000";
    if (key === "fake") replay.players[0].fake = true;
    expect(() => validateReplayIdentity(replay, summary, matchId)).toThrow();
  });
  it("rejects missing and duplicate players rather than partially matching the roster", () => {
    const replay = metadata(); replay.players.pop();
    expect(() => validateReplayIdentity(replay, summary, matchId)).toThrow("incomplete");
    const duplicate = metadata(); duplicate.players[9] = duplicate.players[0];
    expect(() => validateReplayIdentity(duplicate, summary, matchId)).toThrow();
  });
  it("rejects the wrong winner or mode", () => {
    expect(() => validateReplayIdentity({ ...metadata(), winner: 3 }, summary, matchId)).toThrow("winner");
    expect(() => validateReplayIdentity({ ...metadata(), gameMode: 23 }, summary, matchId)).toThrow("mode");
  });
  it("requires at least two account anchors while respecting unknown private accounts", () => {
    const partial = { ...summary, players: summary.players.map((p, i) => ({ ...p, account_id: i < 2 ? p.account_id : null })) };
    expect(validateReplayIdentity(metadata(), partial, matchId)).toBe("verified-roster");
    partial.players[1].account_id = null;
    expect(() => validateReplayIdentity(metadata(), partial, matchId)).toThrow("At least two");
  });
  it("doesn't trust a different or incomplete stored match summary", () => {
    expect(() => validateReplayIdentity(metadata(), { ...summary, match_id: 1 }, matchId)).toThrow("Full match roster");
    expect(() => validateReplayIdentity(metadata(), { ...summary, players: summary.players.slice(1) }, matchId)).toThrow();
  });
});
