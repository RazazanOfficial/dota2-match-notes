import { heroById } from "../../data/heroes";
import { roleFromStratzPosition } from "./enrichment";
import type { StratzMatch } from "./validation";

export { roleFromStratzPosition } from "./enrichment";

function heroSummary(heroId: number | null | undefined) {
  if (!heroId) return null;
  const hero = heroById(heroId);
  return { heroId, heroName: hero?.name || `Hero ${heroId}` };
}

export function buildStratzMatchDiagnostics(
  requestedMatchId: number,
  match: StratzMatch | null,
  steamAccountId: number,
) {
  if (!match) {
    return { matchId: String(requestedMatchId), found: false };
  }
  const player = match.players?.find((candidate) => candidate.steamAccountId === steamAccountId);
  const banEvents = (match.pickBans || [])
    .filter((entry) => entry.isPick === false)
    .map((entry) => ({
      order: entry.order ?? null,
      nominatedHero: heroSummary(entry.heroId),
      bannedHero: heroSummary(entry.bannedHeroId),
      effectiveHero: heroSummary(entry.bannedHeroId ?? entry.heroId),
      wasBannedSuccessfully: entry.wasBannedSuccessfully ?? null,
      isRadiant: entry.isRadiant ?? null,
      playerIndex: entry.playerIndex ?? null,
      isCaptain: entry.isCaptain ?? null,
    }))
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER));

  return {
    matchId: String(requestedMatchId),
    found: true,
    parsed: Boolean(match.parsedDateTime || match.statsDateTime),
    parsedDateTime: match.parsedDateTime ?? null,
    statsDateTime: match.statsDateTime ?? null,
    player: player
      ? {
          steamAccountId: String(steamAccountId),
          hero: heroSummary(player.heroId),
          playerSlot: player.playerSlot ?? null,
          position: player.position ?? null,
          normalizedRole: roleFromStratzPosition(player.position),
          rawRole: player.role ?? null,
          rawRoleBasic: player.roleBasic ?? null,
        }
      : null,
    pickBanEntryCount: match.pickBans?.length ?? 0,
    banEventCount: banEvents.length,
    banEvents,
  };
}
