import { heroById } from "../../data/heroes";
import type { MatchRole } from "@/lib/types";
import type { OpenDotaMatch, OpenDotaPlayer } from "./validation";

export function suggestMatchRole(match: OpenDotaMatch, player: OpenDotaPlayer): MatchRole | null {
  if (player.is_roaming) return "soft_support";
  const teammates = match.players.filter(
    (candidate) => (candidate.player_slot < 128) === (player.player_slot < 128),
  );
  const economy = (candidate: OpenDotaPlayer) => candidate.net_worth ?? candidate.gold_per_min ?? 0;
  const economyRank = [...teammates]
    .sort((left, right) => economy(right) - economy(left))
    .findIndex((candidate) => candidate.player_slot === player.player_slot) + 1;

  if (player.lane_role === 2) return "mid_lane";
  if (economyRank >= 4) return economyRank >= 5 ? "hard_support" : "soft_support";
  if (player.lane_role === 1) return "safe_lane";
  if (player.lane_role === 3) return "off_lane";
  return null;
}

export function collectAutomaticBans(match: OpenDotaMatch) {
  const unique = new Map<number, { heroId: number; heroName: string; team: number; draftOrder: number }>();
  for (const entry of match.picks_bans || []) {
    if (entry.is_pick || unique.has(entry.hero_id)) continue;
    const hero = heroById(entry.hero_id);
    if (!hero) continue;
    unique.set(entry.hero_id, {
      heroId: hero.id,
      heroName: hero.name,
      team: entry.team,
      draftOrder: entry.order ?? unique.size,
    });
  }
  return [...unique.values()].sort((left, right) => left.draftOrder - right.draftOrder).slice(0, 20);
}
