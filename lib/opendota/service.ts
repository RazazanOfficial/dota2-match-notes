import type { SessionUser } from "@/lib/auth/session";
import { fetchOpenDotaMatch } from "./client";
import { getOpenDotaConfig } from "./config";
import { OpenDotaError } from "./errors";
import {
  claimManualOpenDotaSync,
  claimOpenDotaRequestQuota,
  findOpenDotaSyncTarget,
  releaseManualOpenDotaSyncClaim,
  saveOpenDotaMatch,
} from "./repository";

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
    await claimOpenDotaRequestQuota({
      minuteRequestLimit: config.minuteRequestLimit,
      dailyRequestLimit: config.dailyRequestLimit,
    });
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
