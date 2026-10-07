import { heroById } from "../src/data/heroes";

type Player = { hero_id: number; player_slot: number; account_id?: number | null };
type Summary = { match_id: number; game_mode?: number; radiant_win?: boolean; players: Player[] };
export type ReplayIdentity = { matchIds: string[]; gameMode: number; winner: number; players: { hero: string; team: number; steamId: string; fake: boolean }[] };
const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];

export class ReplayIdentityError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
const reject = (message: string): never => { throw new ReplayIdentityError("replay_identity_mismatch", message); };
const heroKey = (name: string) => name.replace(/^(?:npc_dota_hero_|CDOTA_Unit_Hero_)/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

/** Never turn a missing embedded ID into proof of identity by itself. */
export function validateReplayIdentity(identity: ReplayIdentity, summary: Summary, matchId: number) {
  if (!identity || !Array.isArray(identity.matchIds)) reject("Replay identity metadata is missing");
  const ids = identity.matchIds.filter(id => id !== "0");
  if (ids.some(id => id !== String(matchId))) reject("Embedded replay ID belongs to another match");
  if (ids.length) return "embedded-id" as const;
  if (!summary || summary.match_id !== matchId || summary.players?.length !== 10 ||
      new Set(summary.players.map(p => p.player_slot)).size !== 10 ||
      !slots.every(slot => summary.players.some(p => p.player_slot === slot))) reject("Full match roster is required to verify a replay without an ID");
  if (!Array.isArray(identity.players) || identity.players.length !== 10 || identity.players.some(p => p.fake)) reject("Replay roster is incomplete");
  if (identity.gameMode > 0 && summary.game_mode && identity.gameMode !== summary.game_mode) reject("Replay game mode differs from match summary");
  if ([2, 3].includes(identity.winner) && typeof summary.radiant_win === "boolean" && identity.winner !== (summary.radiant_win ? 2 : 3)) reject("Replay winner differs from match summary");
  const remaining = [...identity.players];
  let accounts = 0;
  for (const player of summary.players) {
    const hero = heroById(player.hero_id);
    if (!hero) reject("Match roster contains an unsupported hero");
    const team = player.player_slot < 128 ? 2 : 3;
    const index = remaining.findIndex(p => p.team === team && typeof p.hero === "string" && heroKey(p.hero) === heroKey(hero!.slug));
    if (index < 0) reject("Replay heroes or teams differ from match summary");
    const [actual] = remaining.splice(index, 1);
    if (Number.isInteger(player.account_id) && player.account_id! > 0 && player.account_id! < 4294967295) {
      const steamId = (76561197960265728n + BigInt(player.account_id!)).toString();
      if (actual.steamId !== steamId) reject("Replay participants differ from match summary");
      accounts++;
    }
  }
  if (accounts < 2) throw new ReplayIdentityError("replay_identity_unavailable", "At least two known accounts and all ten heroes and teams are required for roster verification");
  return "verified-roster" as const;
}
