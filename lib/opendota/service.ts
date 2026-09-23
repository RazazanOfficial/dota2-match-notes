import type { SessionUser } from "@/lib/auth/session";
import { getStratzConfig } from "@/lib/stratz/config";
import { runStratzEnrichmentTick } from "@/lib/stratz/job-service";
import { enqueueStratzBackfillForUser } from "@/lib/stratz/job-repository";
import {
  fetchOpenDotaMatch,
  fetchOpenDotaPlayerMatchesSince,
  fetchOpenDotaRecentMatches,
} from "./client";
import { ANALYSIS_TOKEN_COST } from "./analysis-policy";
import type { ManualMatchSyncInput } from "./sync-request";
import { MATCH_SYNC_GAME_MODES, matchesSyncGameMode, saturdayWeekStart } from "./sync-request";
import { requestOpenDotaAnalysisRange } from "@/lib/opendota-parse/repository";
import { toJournalDateKey } from "@/lib/journal/timezone";
import { getOpenDotaConfig } from "./config";
import { OpenDotaError } from "./errors";
import {
  excludeKnownRecentMatches,
  selectRecentSyncMatches,
} from "./recent";
import {
  claimManualOpenDotaSync,
  claimOpenDotaRequestQuota,
  findKnownOpenDotaMatchIds,
  findOpenDotaSyncTarget,
  markJournalRangeCompleted,
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
  range?: { from: string; to: string };
  gameModes?: ManualMatchSyncInput["gameModes"];
}

const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 30;

async function fetchSelectedHistory(user: RecentSyncUser, range: { from: string; to: string }, onClaim?: () => void) {
  // OpenDota offers a lower age bound and offset, but no end-date parameter.
  // Read bounded pages until the selected dates are covered; never mark an
  // incomplete scan as completed when the safety cap is reached.
  const since = new Date(`${range.from}T00:00:00.000Z`);
  since.setUTCDate(since.getUTCDate() - 1);
  const matches: Awaited<ReturnType<typeof fetchOpenDotaPlayerMatchesSince>> = [];
  const config = getOpenDotaConfig();
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    await claimOpenDotaRequestQuota(quotaConfig(config));
    onClaim?.();
    const batch = await fetchOpenDotaPlayerMatchesSince(user.steamAccountId, since, page * HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE);
    matches.push(...batch);
    if (batch.length < HISTORY_PAGE_SIZE || batch[batch.length - 1].start_time * 1_000 < since.getTime()) return matches;
  }
  throw new OpenDotaError(503, "opendota_history_too_large", "تاریخچه بازی‌ها برای این بازه خیلی بزرگ است؛ لطفاً بعداً دوباره تلاش کنید");
}

async function discoverRecentMatches(
  user: RecentSyncUser,
  options: RecentSyncOptions,
) {
  const config = getOpenDotaConfig();
  // The compact recent feed is best for the scheduled cursor. An explicit
  // day/week request uses player history so the user can retrieve an older week.
  let fetchedMatches: Awaited<ReturnType<typeof fetchOpenDotaRecentMatches>>;
  if (options.range) {
    fetchedMatches = await fetchSelectedHistory(user, options.range, options.onExternalRequestClaimed);
  } else {
    await claimOpenDotaRequestQuota(quotaConfig(config));
    options.onExternalRequestClaimed?.();
    fetchedMatches = await fetchOpenDotaRecentMatches(user.steamAccountId);
  }
  const recentMatches = options.range
    ? fetchedMatches.filter((match) => {
        const day = toJournalDateKey(new Date(match.start_time * 1_000));
        return day >= options.range!.from &&
          day <= options.range!.to &&
          matchesSyncGameMode(options.gameModes, match.game_mode, match.lobby_type);
      })
    : fetchedMatches;
  const { importedIds, dismissedIds } = await findKnownOpenDotaMatchIds(
    user.id,
    recentMatches.map((match) => match.match_id),
  );
  const newMatches = excludeKnownRecentMatches(
    recentMatches,
    importedIds,
    dismissedIds,
  );
  const selection = selectRecentSyncMatches(
    newMatches,
    options.range
      ? { maxNewMatches: options.maxNewMatches }
      : options,
  );
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
      if (saved.created) {
        imported.push({
          journalMatchId: saved.journalMatchId,
          dotaMatchId: saved.dotaMatchId,
          day: saved.day,
        });
      } else if (saved.dismissed) dismissedIds.add(saved.dotaMatchId);
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
    dismissedByUser: dismissedIds.size,
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
  const stratzConfig = getStratzConfig();
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
    const stratz = stratzConfig.inlineProcessBatchSize
      ? await runStratzEnrichmentTick({
          userId: user.id,
          processBatchSize: 1,
        })
      : { processed: 0, jobs: [] };
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
      stratz,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    if (!completed) {
      await releaseManualOpenDotaSyncClaim(user.id, claimedAt).catch(() => {});
    }
  }
}

function emptyAnalysisSummary() {
  return {
    tokenCostPerMatch: ANALYSIS_TOKEN_COST,
    totalTokenCost: 0,
    queued: 0,
    alreadyReady: 0,
    alreadyQueued: 0,
    failed: 0,
    skippedOld: 0,
    skippedOldDays: [] as string[],
  };
}

export async function syncRecentMatchesFromOpenDota(
  user: SessionUser,
  request: ManualMatchSyncInput,
) {
  const config = getOpenDotaConfig();
  const stratzConfig = getStratzConfig();
  const trackedFrom = saturdayWeekStart(toJournalDateKey(user.createdAt));
  if (request.from < trackedFrom) {
    throw new OpenDotaError(
      400,
      "before_tracking_window",
      "دریافت مچ فقط از ابتدای هفته ثبت‌نام امکان‌پذیر است",
    );
  }
  const claimedAt = await claimManualOpenDotaSync(
    user.id,
    config.manualSyncCooldownSeconds,
  );
  let externalRequestClaimed = false;

  try {
    const sync = await discoverRecentMatches(user, {
      maxNewMatches: config.maxNewMatchesPerSync,
      range: { from: request.from, to: request.to },
      gameModes: request.gameModes,
      onExternalRequestClaimed: () => {
        externalRequestClaimed = true;
      },
    });
    const checkedEveryGameMode = !request.gameModes || new Set(request.gameModes).size === MATCH_SYNC_GAME_MODES.length;
    if (!sync.failed.length && sync.deferred === 0 && checkedEveryGameMode) {
      await markJournalRangeCompleted(user.id, request.from, request.to);
    }
    const analysis = request.mode === "analysis"
      ? await requestOpenDotaAnalysisRange(user.id, request.from, request.to, request.gameModes)
      : emptyAnalysisSummary();
    const backfillQueued = stratzConfig.backfillOnManualSync
      ? await enqueueStratzBackfillForUser(user.id)
      : 0;
    const stratz = stratzConfig.inlineProcessBatchSize
      ? await runStratzEnrichmentTick({
          userId: user.id,
          processBatchSize: stratzConfig.inlineProcessBatchSize,
        })
      : { processed: 0, jobs: [] };
    return {
      ...sync,
      stratz: {
        backfillEnabled: stratzConfig.backfillOnManualSync,
        backfillQueued,
        ...stratz,
      },
      registeredAt: user.createdAt.toISOString(),
      trackedFrom: `${trackedFrom}T00:00:00.000Z`,
      request,
      analysis,
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
