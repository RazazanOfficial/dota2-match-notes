import type { SessionUser } from "@/lib/auth/session";
import { fetchSteamProfileRequired } from "@/lib/auth/steam";
import { getOpenDotaConfig } from "@/lib/opendota/config";
import { isSuperAdminSteamId, parseSuperAdminSteamIds } from "./config";
import { AdminError } from "./errors";
import {
  getAdminOverviewData,
  listAdminUsers,
  provisionAdminUser,
} from "./repository";

function withEffectiveAccess<T extends { steamId: string; isAdmin: boolean }>(
  user: T,
) {
  const isSuperAdmin = isSuperAdminSteamId(user.steamId);
  return {
    ...user,
    isAdmin: user.isAdmin || isSuperAdmin,
    isSuperAdmin,
  };
}

export async function getAdminUsers(params: {
  query: string;
  limit: number;
  offset: number;
}) {
  const result = await listAdminUsers(params);
  return {
    ...result,
    users: result.users.map(withEffectiveAccess),
    limit: params.limit,
    offset: params.offset,
  };
}

export async function provisionUserFromSteam(
  actor: SessionUser,
  steamId: string,
) {
  let profile;
  try {
    profile = await fetchSteamProfileRequired(steamId);
  } catch (error) {
    console.error("Admin Steam profile lookup failed", error);
    throw new AdminError(
      502,
      "steam_profile_unavailable",
      "دریافت پروفایل از Steam انجام نشد",
    );
  }

  const result = await provisionAdminUser({ actorUserId: actor.id, profile });
  return { ...result, user: withEffectiveAccess(result.user) };
}

export async function getAdminOverview() {
  const data = await getAdminOverviewData();
  const { rateLimits, ...overview } = data;
  const config = getOpenDotaConfig();
  const now = Date.now();
  const windows = {
    "opendota:minute": {
      limit: config.minuteRequestLimit,
      durationSeconds: 60,
    },
    "opendota:day": {
      limit: config.dailyRequestLimit,
      durationSeconds: 86_400,
    },
  } as const;

  return {
    ...overview,
    superAdminConfiguration: {
      configuredSteamIds: parseSuperAdminSteamIds(
        process.env.SUPER_ADMIN_STEAM_IDS,
      ).size,
    },
    openDotaUsage: Object.entries(windows).map(([key, window]) => {
      const stored = rateLimits.find((row) => row.key === key);
      const resetAt = stored
        ? new Date(
            stored.windowStartedAt.getTime() + window.durationSeconds * 1_000,
          )
        : null;
      const active = Boolean(resetAt && resetAt.getTime() > now);
      const used = active ? stored?.requestCount || 0 : 0;
      return {
        key,
        used,
        limit: window.limit,
        remaining: Math.max(0, window.limit - used),
        resetAt: active ? resetAt : null,
      };
    }),
  };
}
