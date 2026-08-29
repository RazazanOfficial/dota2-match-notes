import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminAuditLogs, journalMatches, users } from "@/lib/db/schema";
import { fetchOpenDotaMatch } from "@/lib/opendota/client";
import { getOpenDotaConfig } from "@/lib/opendota/config";
import { OpenDotaError } from "@/lib/opendota/errors";
import { claimOpenDotaRequestQuota, saveOpenDotaMatch } from "@/lib/opendota/repository";
import { AdminError } from "./errors";

export async function reprocessRecentUserMatches(params: { actorUserId: string; targetUserId: string; count: number }) {
  const targets = await getDb().select({ journalMatchId: journalMatches.id, dotaMatchId: journalMatches.dotaMatchId, heroId: journalMatches.heroId, steamAccountId: users.steamAccountId }).from(journalMatches).innerJoin(users, eq(journalMatches.userId, users.id)).where(and(eq(journalMatches.userId, params.targetUserId), isNotNull(journalMatches.dotaMatchId))).orderBy(desc(journalMatches.startedAt), desc(journalMatches.createdAt)).limit(params.count);
  if (!targets.length) {
    const [targetUser] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, params.targetUserId)).limit(1);
    if (!targetUser) throw new AdminError(404, "user_not_found", "کاربر پیدا نشد");
    throw new AdminError(404, "matches_not_found", "مچی برای تحلیل مجدد پیدا نشد");
  }
  const config = getOpenDotaConfig();
  const refreshed: Array<{ journalMatchId: string; dotaMatchId: string }> = [];
  const failed: Array<{ dotaMatchId: string; code: string; message: string }> = [];
  for (const target of targets) {
    if (!target.dotaMatchId) continue;
    try {
      await claimOpenDotaRequestQuota({ minuteRequestLimit: config.minuteRequestLimit, dailyRequestLimit: config.dailyRequestLimit });
      const match = await fetchOpenDotaMatch(target.dotaMatchId);
      const byAccount = match.players.find((candidate) => candidate.account_id === target.steamAccountId);
      const byHero = target.heroId ? match.players.filter((candidate) => candidate.hero_id === target.heroId) : [];
      const player = byAccount || (byHero.length === 1 ? byHero[0] : null);
      if (!player) throw new OpenDotaError(422, "player_not_found_in_match", "بازیکن در اطلاعات مچ پیدا نشد");
      await saveOpenDotaMatch({ userId: params.targetUserId, journalMatchId: target.journalMatchId, match, player, queueImages: false });
      refreshed.push({ journalMatchId: target.journalMatchId, dotaMatchId: String(target.dotaMatchId) });
    } catch (error) {
      failed.push({ dotaMatchId: String(target.dotaMatchId), code: error instanceof OpenDotaError ? error.code : "reprocess_failed", message: error instanceof Error ? error.message : "تحلیل مجدد انجام نشد" });
      if (error instanceof OpenDotaError && (error.status === 429 || error.status >= 500)) break;
    }
  }
  await getDb().insert(adminAuditLogs).values({ actorUserId: params.actorUserId, targetUserId: params.targetUserId, action: "user.matches_reprocessed", metadata: { requested: params.count, selected: targets.length, refreshed: refreshed.length, failed: failed.length } });
  return { requested: params.count, selected: targets.length, refreshed, failed, stratzQueued: refreshed.length };
}
