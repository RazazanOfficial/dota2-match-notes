import { heroById } from "@/data/heroes";
import { openDotaMatchSchema } from "./validation";

const roles = ["safe_lane", "mid_lane", "off_lane", "soft_support", "hard_support"] as const;

// position_est is an OpenDota estimate, not a position asserted by the replay.
export function estimatedOpenDotaRole(raw: unknown, accountId?: number | null, heroId?: number | null) {
  const match = openDotaMatchSchema.safeParse(raw);
  if (!match.success) return null;
  const player = match.data.players.find((entry) => accountId && entry.account_id === accountId)
    ?? match.data.players.find((entry) => heroId && entry.hero_id === heroId);
  const estimate = Number(player?.position_est);
  return Number.isInteger(estimate) && estimate >= 1 && estimate <= 5 ? roles[estimate - 1] : null;
}

export function openDotaDraft(raw: unknown, profileHeroId?: number | null) {
  const match = openDotaMatchSchema.safeParse(raw);
  if (!match.success) return { bans: [], picks: [] };
  const pickedHeroes = new Set(match.data.players.map((player) => player.hero_id));
  const seen = new Set<number>();
  const bans = (match.data.picks_bans ?? []).filter((event) => !event.is_pick)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .flatMap((event) => {
      if (pickedHeroes.has(event.hero_id) || seen.has(event.hero_id)) return [];
      const hero = heroById(event.hero_id);
      if (!hero) return [];
      seen.add(event.hero_id);
      return [{ id: hero.id, name: hero.name, source: "opendota" as const, team: event.team, draftOrder: event.order ?? null }];
    });
  // Actual final heroes are authoritative: draft logs can include repicks.
  const picks = match.data.players
    .filter((player) => player.hero_id !== profileHeroId &&
      (player.player_slot >= 0 && player.player_slot <= 4 || player.player_slot >= 128 && player.player_slot <= 132))
    .flatMap((player) => {
      const hero = heroById(player.hero_id);
      return hero ? [{ id: hero.id, name: hero.name, playerSlot: player.player_slot, team: player.player_slot < 128 ? 0 : 1 }] : [];
    }).slice(0, 9);
  return { bans, picks };
}
