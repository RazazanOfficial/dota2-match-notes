import type { SessionUser } from "@/lib/auth/session";
import {
  fetchOpenDotaMatch,
  fetchOpenDotaRecentMatches,
} from "./client";
import { getOpenDotaConfig } from "./config";
import { OpenDotaError } from "./errors";
import { selectRecentSyncMatches } from "./recent";
import {
  claimManualOpenDotaSync,
  claimOpenDotaRequestQuota,
  findImportedOpenDotaMatchIds,
  findOpenDotaSyncTarget,
  releaseManualOpenDotaSyncClaim,
  saveDiscoveredOpenDotaMatch,
  saveOpenDotaMatch,
} from "./repository";

function quotaConfig(config: ReturnType<typeof getOpenDotaConfig>) {
  return {
    minuteRequestLimit: config.minuteRequestLimit,
    dailyRequestLimit: config.dailyRequestLimit,
  };
}

function failedMatch(dotaMatchId: number, error: unknown) {
  if (error instanceof OpenDotaError) {
    return {
      dotaMatchId,
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    };
  }
  console.error("Unable to import discovered OpenDota match", {
    dotaMatchId,
    error,
  });
  return {
    dotaMatchId,
    code: "match_import_failed",
    message: "ثبت این مچ انجام نشد",
  };
}

interface RecentSyncUser {
  id: string;
  steamAccountId: number;
}

interface RecentSyncOptions {
  maxNewMatches: number;
  since?: Date | null;
  lookbackSeconds?: number;
  initialMatches?: number;
  throwOnRetryableError?: boolean;
  onExternalRequestClaimed?: () => void;
}

async function discoverRecentMatches(
  user: RecentSyncUser,
  options: RecentSyncOptions,
) {
  const config = getOpenDotaConfig();
  await claimOpenDotaRequestQuota(quotaConfig(config));
  options.onExternalRequestClaimed?.();
  const recentMatches = await fetchOpenDotaRecentMatches(user.steamAccountId);
  const importedIds = await findImportedOpenDotaMatchIds(
    user.id,
    recentMatches.map((match) => match.match_id),
  );
  const newMatches = recentMatches.filter(
    (match) => !importedIds.has(match.match_id),
  );
  const selection = selectRecentSyncMatches(newMatches, options);
  const imported: Array<{
    journalMatchId: string;
    dotaMatchId: number;
    day: string;
  }> = [];
  const failed: ReturnType<typeof failedMatch>[] = [];
  let attempted = 0;

  for (const candidate of selection.candidates) {
    attempted += 1;
    try {
      await claimOpenDotaRequestQuota(quotaConfig(config));
      options.onExternalRequestClaimed?.();
      const match = await fetchOpenDotaMatch(candidate.match_id);
      const player =
        match.players.find(
          (item) => item.account_id === user.steamAccountId,
        ) ||
        match.players.find(
          (item) => item.player_slot === candidate.player_slot,
        );
      if (!player) {
        throw new OpenDotaError(
          422,
          "player_not_found_in_match",
          "بازیکن داخل اطلاعات کامل مچ پیدا نشد",
        );
      }

      const saved = await saveDiscoveredOpenDotaMatch({
        userId: user.id,
        match,
        player,
      });
      if (saved.created) imported.push(saved);
      else importedIds.add(saved.dotaMatchId);
    } catch (error) {
      if (!(error instanceof OpenDotaError)) throw error;
      const retryable = error.status === 429 || error.status >= 500;
      if (retryable && options.throwOnRetryableError) throw error;
      failed.push(failedMatch(candidate.match_id, error));
      if (error.status === 429) break;
    }
  }

  return {
    checked: recentMatches.length,
    alreadyImported: importedIds.size,
    imported,
    failed,
    deferred: Math.max(0, selection.eligible.length - attempted),
    ignoredOlder: selection.ignoredOlder,
  };
}

export async function syncJournalMatchFromOpenDota(
  user: SessionUser,
  journalMatchId: string,
  dotaMatchId: number,
) {
  const target = await findOpenDotaSyncTarget(user.id, journalMatchId);
  if (!target) {
    throw new OpenDotaError(404, "match_not_found", "مچ دفتر پیدا نشد");
  }

  const config = getOpenDotaConfig();
  const claimedAt = await claimManualOpenDotaSync(
    user.id,
    config.manualSyncCooldownSeconds,
  );
  let completed = false;
  try {
    await claimOpenDotaRequestQuota(quotaConfig(config));
    const match = await fetchOpenDotaMatch(dotaMatchId);
    const player = match.players.find(
      (candidate) => candidate.account_id === target.steamAccountId,
    );
    if (!player) {
      throw new OpenDotaError(
        422,
        "player_not_found_in_match",
        "حساب Steam شما در این مچ پیدا نشد؛ Match ID یا تنظیمات حریم خصوصی را بررسی کنید",
      );
    }

    const saved = await saveOpenDotaMatch({
      userId: user.id,
      journalMatchId,
      match,
      player,
    });
    completed = true;
    return {
      journalMatchId: saved.id,
      dotaMatchId: saved.dotaMatchId,
      source: saved.source,
      heroId: saved.heroId,
      heroName: saved.heroName,
      result: saved.result,
      startedAt: saved.startedAt?.toISOString() || null,
      durationSeconds: saved.durationSeconds,
      kills: saved.kills,
      deaths: saved.deaths,
      assists: saved.assists,
      goldPerMinute: saved.goldPerMinute,
      xpPerMinute: saved.xpPerMinute,
      netWorth: saved.netWorth,
      heroDamage: saved.heroDamage,
      towerDamage: saved.towerDamage,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    if (!completed) {
      await releaseManualOpenDotaSyncClaim(user.id, claimedAt).catch(() => {});
    }
  }
}

export async function syncRecentMatchesFromOpenDota(user: SessionUser) {
  const config = getOpenDotaConfig();
  const claimedAt = await claimManualOpenDotaSync(
    user.id,
    config.manualSyncCooldownSeconds,
  );
  let externalRequestClaimed = false;

  try {
    const sync = await discoverRecentMatches(user, {
      maxNewMatches: config.maxNewMatchesPerSync,
      onExternalRequestClaimed: () => {
        externalRequestClaimed = true;
      },
    });
    return {
      ...sync,
      nextAllowedAt: new Date(
        claimedAt.getTime() + config.manualSyncCooldownSeconds * 1_000,
      ).toISOString(),
    };
  } catch (error) {
    if (!externalRequestClaimed) {
      await releaseManualOpenDotaSyncClaim(user.id, claimedAt).catch(() => {});
    }
    throw error;
  }
}

export async function syncScheduledMatchesFromOpenDota(
  user: RecentSyncUser & {
    lastManualSyncAt: Date | null;
    lastScheduledSyncAt: Date | null;
  },
  options: { lookbackSeconds: number; initialMatches: number },
) {
  const config = getOpenDotaConfig();
  return discoverRecentMatches(user, {
    maxNewMatches: config.maxNewMatchesPerSync,
    since: user.lastScheduledSyncAt || user.lastManualSyncAt,
    lookbackSeconds: options.lookbackSeconds,
    initialMatches: options.initialMatches,
    throwOnRetryableError: true,
  });
}
