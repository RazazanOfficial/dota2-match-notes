import type { MatchRole } from "@/lib/types";

export const HERO_POOL_ROLES: readonly MatchRole[] = [
  "safe_lane",
  "mid_lane",
  "off_lane",
  "soft_support",
  "hard_support",
];

export type HeroPoolSizeState = "minimum" | "ideal" | "caution" | "overload";

export function heroPoolSizeState(size: number): HeroPoolSizeState {
  if (size <= 2) return "minimum";
  if (size <= 5) return "ideal";
  if (size === 6) return "caution";
  return "overload";
}

export function isHeroPoolEligibleMode(
  gameMode: number | null | undefined,
  lobbyType: number | null | undefined,
) {
  if (gameMode === 4) return false; // Single Draft
  return gameMode === 1 || gameMode === 2 || gameMode === 22 || gameMode === 23 || lobbyType === 7;
}

export function isHeroInRolePool(
  pools: Partial<Record<MatchRole, number[]>>,
  role: MatchRole | "",
  heroId: number | null,
) {
  return Boolean(role && heroId && pools[role]?.includes(heroId));
}

