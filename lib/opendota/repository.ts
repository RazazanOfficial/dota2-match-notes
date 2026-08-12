import { and, eq, isNull, lte, ne, or, sql } from "drizzle-orm";
import { heroById } from "@/data/heroes";
import { getDb } from "@/lib/db";
import {
  dotaMatches,
  externalApiRateLimits,
  journalMatches,
  users,
} from "@/lib/db/schema";
import { OpenDotaError } from "./errors";
import type { OpenDotaMatch, OpenDotaPlayer } from "./validation";

export async function findOpenDotaSyncTarget(userId: string, matchId: string) {
  const [target] = await getDb()
    .select({
      id: journalMatches.id,
      steamAccountId: users.steamAccountId,
    })
    .from(journalMatches)
    .innerJoin(users, eq(journalMatches.userId, users.id))
    .where(
      and(eq(journalMatches.id, matchId), eq(journalMatches.userId, userId)),
    )
    .limit(1);

  return target || null;
}

export async function claimManualOpenDotaSync(
  userId: string,
  cooldownSeconds: number,
) {
  const claimedAt = new Date();
  const availableBefore = new Date(
    claimedAt.getTime() - cooldownSeconds * 1_000,
  );
  const [claim] = await getDb()
    .update(users)
    .set({ lastManualSyncAt: claimedAt })
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(users.lastManualSyncAt),
          lte(users.lastManualSyncAt, availableBefore),
        ),
      ),
    )
    .returning({ claimedAt: users.lastManualSyncAt });

  if (claim?.claimedAt) return claim.claimedAt;

  const [user] = await getDb()
    .select({ lastManualSyncAt: users.lastManualSyncAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const elapsedSeconds = user?.lastManualSyncAt
    ? Math.floor((claimedAt.getTime() - user.lastManualSyncAt.getTime()) / 1_000)
    : 0;
  const retryAfterSeconds = Math.max(1, cooldownSeconds - elapsedSeconds);
  throw new OpenDotaError(
    429,
    "manual_sync_cooldown",
    "همگام‌سازی دستی هر ۵ دقیقه یک‌بار مجاز است",
    retryAfterSeconds,
  );
}

export async function releaseManualOpenDotaSyncClaim(
  userId: string,
  claimedAt: Date,
) {
  await getDb()
    .update(users)
    .set({ lastManualSyncAt: null })
    .where(
      and(eq(users.id, userId), eq(users.lastManualSyncAt, claimedAt)),
    );
}

interface RateWindow {
  key: string;
  durationSeconds: number;
  limit: number;
}

export async function claimOpenDotaRequestQuota(params: {
  minuteRequestLimit: number;
  dailyRequestLimit: number;
}) {
  const now = new Date();
  const windows: RateWindow[] = [
    {
      key: "opendota:minute",
      durationSeconds: 60,
      limit: params.minuteRequestLimit,
    },
    {
      key: "opendota:day",
      durationSeconds: 24 * 60 * 60,
      limit: params.dailyRequestLimit,
    },
  ];

  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('external-api:opendota', 0))`,
    );

    for (const window of windows) {
      const [current] = await tx
        .select()
        .from(externalApiRateLimits)
        .where(eq(externalApiRateLimits.key, window.key))
        .limit(1);
      const elapsedMs = current
        ? now.getTime() - current.windowStartedAt.getTime()
        : Number.POSITIVE_INFINITY;
      const durationMs = window.durationSeconds * 1_000;

      if (!current || elapsedMs >= durationMs || elapsedMs < 0) {
        await tx
          .insert(externalApiRateLimits)
          .values({
            key: window.key,
            windowStartedAt: now,
            requestCount: 1,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: externalApiRateLimits.key,
            set: {
              windowStartedAt: now,
              requestCount: 1,
              updatedAt: now,
            },
          });
        continue;
      }

      if (current.requestCount >= window.limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((durationMs - elapsedMs) / 1_000),
        );
        throw new OpenDotaError(
          429,
          "opendota_global_rate_limited",
          "ظرفیت موقت OpenDota پر شده است؛ کمی بعد دوباره تلاش کنید",
          retryAfterSeconds,
        );
      }

      await tx
        .update(externalApiRateLimits)
        .set({
          requestCount: sql`${externalApiRateLimits.requestCount} + 1`,
          updatedAt: now,
        })
        .where(eq(externalApiRateLimits.key, window.key));
    }
  });
}

export async function saveOpenDotaMatch(params: {
  userId: string;
  journalMatchId: string;
  match: OpenDotaMatch;
  player: OpenDotaPlayer;
}) {
  const { userId, journalMatchId, match, player } = params;
  const now = new Date();
  const startedAt = new Date(match.start_time * 1_000);
  const isRadiant = player.player_slot < 128;
  const result = match.radiant_win === isRadiant ? "win" : "loss";
  const heroName = heroById(player.hero_id)?.name || `Hero ${player.hero_id}`;

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`opendota:${journalMatchId}`}, 0))`,
    );

    const [ownedMatch] = await tx
      .select({ id: journalMatches.id })
      .from(journalMatches)
      .where(
        and(
          eq(journalMatches.id, journalMatchId),
          eq(journalMatches.userId, userId),
        ),
      )
      .limit(1);
    if (!ownedMatch) {
      throw new OpenDotaError(404, "match_not_found", "مچ دفتر پیدا نشد");
    }

    const [duplicate] = await tx
      .select({ id: journalMatches.id })
      .from(journalMatches)
      .where(
        and(
          eq(journalMatches.userId, userId),
          eq(journalMatches.dotaMatchId, match.match_id),
          ne(journalMatches.id, journalMatchId),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new OpenDotaError(
        409,
        "dota_match_already_linked",
        "این Match ID قبلاً در دفتر شما ثبت شده است",
      );
    }

    await tx
      .insert(dotaMatches)
      .values({
        matchId: match.match_id,
        startedAt,
        durationSeconds: match.duration,
        radiantWin: match.radiant_win,
        gameMode: match.game_mode ?? null,
        lobbyType: match.lobby_type ?? null,
        rawData: match,
        fetchedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dotaMatches.matchId,
        set: {
          startedAt,
          durationSeconds: match.duration,
          radiantWin: match.radiant_win,
          gameMode: match.game_mode ?? null,
          lobbyType: match.lobby_type ?? null,
          rawData: match,
          fetchedAt: now,
          updatedAt: now,
        },
      });

    const [saved] = await tx
      .update(journalMatches)
      .set({
        dotaMatchId: match.match_id,
        source: "opendota",
        heroId: player.hero_id,
        heroName,
        result,
        startedAt,
        durationSeconds: match.duration,
        kills: player.kills ?? null,
        deaths: player.deaths ?? null,
        assists: player.assists ?? null,
        goldPerMinute: player.gold_per_min ?? null,
        xpPerMinute: player.xp_per_min ?? null,
        netWorth: player.net_worth ?? null,
        heroDamage: player.hero_damage ?? null,
        towerDamage: player.tower_damage ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(journalMatches.id, journalMatchId),
          eq(journalMatches.userId, userId),
        ),
      )
      .returning();

    await tx.update(users).set({ updatedAt: now }).where(eq(users.id, userId));
    return saved;
  });
}
