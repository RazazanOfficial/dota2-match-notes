import { heroById } from "../../data/heroes";
import type { MatchRole } from "../types";
import { StratzError } from "./errors";
import type { StratzMatch, StratzPosition } from "./validation";

const POSITION_ROLE: Partial<Record<StratzPosition, MatchRole>> = {
  POSITION_1: "safe_lane",
  POSITION_2: "mid_lane",
  POSITION_3: "off_lane",
  POSITION_4: "soft_support",
  POSITION_5: "hard_support",
};

export function roleFromStratzPosition(
  position: StratzPosition | null | undefined,
) {
  return position ? POSITION_ROLE[position] || null : null;
}

export function buildStratzEnrichment(params: {
  match: StratzMatch | null;
  steamAccountId: number;
  expectedHeroId: number | null;
  heroPoolEligible: boolean;
}) {
  const { match, steamAccountId, expectedHeroId, heroPoolEligible } = params;
  if (!match) {
    throw new StratzError(
      503,
      "stratz_match_not_ready",
      "اطلاعات این مچ هنوز در STRATZ آماده نیست",
    );
  }

  const player = match.players?.find(
    (candidate) => candidate.steamAccountId === steamAccountId,
  );
  if (!player) {
    throw new StratzError(
      422,
      "stratz_player_not_found",
      "بازیکن داخل اطلاعات STRATZ این مچ پیدا نشد",
    );
  }
  if (expectedHeroId && player.heroId && expectedHeroId !== player.heroId) {
    throw new StratzError(
      422,
      "stratz_hero_mismatch",
      "هیروی بازیکن در STRATZ با اطلاعات مچ هماهنگ نیست",
    );
  }

  const role = roleFromStratzPosition(player.position);
  if (!role) {
    throw new StratzError(
      503,
      "stratz_position_not_ready",
      "پوزیشن بازیکن هنوز در STRATZ آماده نیست",
    );
  }

  const uniqueBans = new Map<number, {
    heroId: number;
    heroName: string;
    team: number | null;
    draftOrder: number | null;
  }>();
  if (heroPoolEligible) {
    for (const entry of match.pickBans || []) {
      if (entry.isPick !== false || entry.wasBannedSuccessfully === false) continue;
      const heroId = entry.bannedHeroId ?? entry.heroId;
      if (!heroId || uniqueBans.has(heroId)) continue;
      const hero = heroById(heroId);
      if (!hero) continue;
      uniqueBans.set(heroId, {
        heroId,
        heroName: hero.name,
        team: entry.isRadiant === true ? 0 : entry.isRadiant === false ? 1 : null,
        draftOrder: entry.order ?? null,
      });
    }
    if (!uniqueBans.size) {
      throw new StratzError(
        503,
        "stratz_bans_not_ready",
        "لیست بن‌های مچ هنوز در STRATZ آماده نیست",
      );
    }
  }

  return {
    role,
    bans: [...uniqueBans.values()].sort(
      (left, right) =>
        (left.draftOrder ?? Number.MAX_SAFE_INTEGER)
        - (right.draftOrder ?? Number.MAX_SAFE_INTEGER),
    ),
  };
}
