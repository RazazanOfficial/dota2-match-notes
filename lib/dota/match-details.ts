import { heroById } from "../../data/heroes";
import type { MatchParticipant } from "../types";
import { openDotaMatchSchema } from "../opendota/validation";

const SCEPTER_ITEM_IDS = new Set([108, 271, 727]);
const SHARD_ITEM_IDS = new Set([609, 725]);

export interface ExtractedMatchDetails {
  radiantWin: boolean | null;
  radiantScore: number | null;
  direScore: number | null;
  participants: MatchParticipant[];
}

const EMPTY_DETAILS: ExtractedMatchDetails = {
  radiantWin: null,
  radiantScore: null,
  direScore: null,
  participants: [],
};

export function extractMatchDetails(
  rawData: unknown,
  profileAccountId?: number | null,
  profileHeroId?: number | null,
): ExtractedMatchDetails {
  const parsed = openDotaMatchSchema.safeParse(rawData);
  if (!parsed.success) return EMPTY_DETAILS;

  const profilePlayerSlot = parsed.data.players.find(
    (player) =>
      Boolean(profileAccountId && profileAccountId > 0) &&
      player.account_id === profileAccountId,
  )?.player_slot ?? parsed.data.players.find(
    (player) => Boolean(profileHeroId && player.hero_id === profileHeroId),
  )?.player_slot;

  const participants = parsed.data.players
    .filter((player) => isStandardPlayerSlot(player.player_slot))
    .map((player): MatchParticipant | null => {
      const hero = heroById(player.hero_id);
      if (!hero) return null;

      const itemIds = normalizeItems([
        player.item_0,
        player.item_1,
        player.item_2,
        player.item_3,
        player.item_4,
        player.item_5,
      ]);
      const backpackItemIds = normalizeItems([
        player.backpack_0,
        player.backpack_1,
        player.backpack_2,
      ]);
      const carriedItems = [...itemIds, ...backpackItemIds];

      return {
        playerSlot: player.player_slot,
        accountId: player.account_id && player.account_id > 0 ? player.account_id : null,
        personName: player.personaname?.trim() || "بازیکن ناشناس",
        heroId: hero.id,
        heroName: hero.name,
        team: player.player_slot < 128 ? "radiant" : "dire",
        level: player.level ?? null,
        kills: player.kills ?? null,
        deaths: player.deaths ?? null,
        assists: player.assists ?? null,
        lastHits: player.last_hits ?? null,
        denies: player.denies ?? null,
        goldPerMinute: player.gold_per_min ?? null,
        xpPerMinute: player.xp_per_min ?? null,
        netWorth: player.net_worth ?? null,
        heroDamage: player.hero_damage ?? null,
        towerDamage: player.tower_damage ?? null,
        heroHealing: player.hero_healing ?? null,
        itemIds,
        backpackItemIds,
        neutralItemId: normalizeItemId(player.item_neutral),
        neutralEnhancementId: normalizeItemId(player.item_neutral2),
        hasAghanimsScepter:
          Boolean(player.aghanims_scepter) ||
          carriedItems.some((itemId) => itemId !== null && SCEPTER_ITEM_IDS.has(itemId)),
        hasAghanimsShard:
          Boolean(player.aghanims_shard) ||
          carriedItems.some((itemId) => itemId !== null && SHARD_ITEM_IDS.has(itemId)),
        isProfilePlayer: player.player_slot === profilePlayerSlot,
      };
    })
    .filter((participant): participant is MatchParticipant => participant !== null)
    .sort((left, right) => left.playerSlot - right.playerSlot)
    .slice(0, 10);

  return {
    radiantWin: parsed.data.radiant_win,
    radiantScore: parsed.data.radiant_score ?? null,
    direScore: parsed.data.dire_score ?? null,
    participants,
  };
}

function isStandardPlayerSlot(playerSlot: number) {
  return (playerSlot >= 0 && playerSlot <= 4) || (playerSlot >= 128 && playerSlot <= 132);
}

function normalizeItems(values: unknown[]) {
  return values.map(normalizeItemId);
}

function normalizeItemId(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}
