import { steamIdToAccountId } from "../auth/steam";

export function parseSuperAdminSteamIds(value: string | undefined) {
  const ids = (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const steamId of ids) {
    try {
      steamIdToAccountId(steamId);
    } catch {
      throw new Error("Invalid env: SUPER_ADMIN_STEAM_IDS");
    }
  }

  return new Set(ids);
}

export function isSuperAdminSteamId(steamId: string) {
  return parseSuperAdminSteamIds(process.env.SUPER_ADMIN_STEAM_IDS).has(steamId);
}
