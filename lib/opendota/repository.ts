import { and, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { heroById } from "@/data/heroes";
import { getDb } from "@/lib/db";
import { toJournalDateKey } from "@/lib/journal/timezone";
import {
  dismissedDotaMatches,
  dotaMatches,
  externalApiDailyUsage,
  externalApiRateLimits,
  heroPoolVersions,
  journalDays,
  journalMatches,
  matchBans,
  matchImageJobs,
  stratzEnrichmentJobs,
  users,
} from "@/lib/db/schema";
import { isHeroPoolEligibleMode } from "@/lib/hero-pool/rules";
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

export async function advanceManualOpenDotaSyncCursor(
  userId: string,
  claimedAt: Date,
) {
  await getDb()
    .update(users)
    .set({ manualSyncCursorAt: claimedAt, updatedAt: claimedAt })
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
  const utcDay = now.toISOString().slice(0, 10);
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

    await tx
      .insert(externalApiDailyUsage)
      .values({
        provider: "opendota",
        day: utcDay,
        requestCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [externalApiDailyUsage.provider, externalApiDailyUsage.day],
        set: {
          requestCount: sql`${externalApiDailyUsage.requestCount} + 1`,
          updatedAt: now,
        },
      });
  });
}

export async function findKnownOpenDotaMatchIds(
  userId: string,
  dotaMatchIds: number[],
) {
  if (!dotaMatchIds.length) {
    return {
      importedIds: new Set<number>(),
      dismissedIds: new Set<number>(),
    };
  }

  const db = getDb();
  const [importedRows, dismissedRows] = await Promise.all([
    db
      .select({ dotaMatchId: journalMatches.dotaMatchId })
      .from(journalMatches)
      .where(
        and(
          eq(journalMatches.userId, userId),
          inArray(journalMatches.dotaMatchId, dotaMatchIds),
        ),
      ),
    db
      .select({ dotaMatchId: dismissedDotaMatches.dotaMatchId })
      .from(dismissedDotaMatches)
      .where(
        and(
          eq(dismissedDotaMatches.userId, userId),
          inArray(dismissedDotaMatches.dotaMatchId, dotaMatchIds),
        ),
      ),
  ]);

  return {
    importedIds: new Set(
      importedRows
        .map((row) => row.dotaMatchId)
        .filter((matchId): matchId is number => matchId !== null),
    ),
    dismissedIds: new Set(dismissedRows.map((row) => row.dotaMatchId)),
  };
}

export async function saveDiscoveredOpenDotaMatch(params: {
  userId: string;
  match: OpenDotaMatch;
  player: OpenDotaPlayer;
}) {
  const { userId, match, player } = params;
  const now = new Date();
  const startedAt = new Date(match.start_time * 1_000);
  const dayKey = toJournalDateKey(startedAt);
  const isRadiant = player.player_slot < 128;
  const result = match.radiant_win === isRadiant ? "win" : "loss";
  const heroName = heroById(player.hero_id)?.name || `Hero ${player.hero_id}`;
  const heroPoolEligible = isHeroPoolEligibleMode(match.game_mode, match.lobby_type);

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`opendota-discovery:${userId}:${dayKey}`}, 0))`,
    );

    const [duplicate] = await tx
      .select({ id: journalMatches.id, day: journalDays.day })
      .from(journalMatches)
      .innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
      .where(
        and(
          eq(journalMatches.userId, userId),
          eq(journalMatches.dotaMatchId, match.match_id),
        ),
      )
      .limit(1);
    if (duplicate) {
      return {
        created: false as const,
        dismissed: false as const,
        journalMatchId: duplicate.id,
        dotaMatchId: match.match_id,
        day: duplicate.day,
      };
    }

    const [dismissed] = await tx
      .select({ dotaMatchId: dismissedDotaMatches.dotaMatchId })
      .from(dismissedDotaMatches)
      .where(
        and(
          eq(dismissedDotaMatches.userId, userId),
          eq(dismissedDotaMatches.dotaMatchId, match.match_id),
        ),
      )
      .limit(1);
    if (dismissed) {
      return {
        created: false as const,
        dismissed: true as const,
        journalMatchId: null,
        dotaMatchId: match.match_id,
        day: null,
      };
    }

    const [day] = await tx
      .insert(journalDays)
      .values({ userId, day: dayKey })
      .onConflictDoUpdate({
        target: [journalDays.userId, journalDays.day],
        set: { updatedAt: now },
      })
      .returning({ id: journalDays.id });
    const [numberRow] = await tx
      .select({
        maximum: sql<number>`coalesce(max(${journalMatches.number}), 0)::int`,
      })
      .from(journalMatches)
      .where(eq(journalMatches.dayId, day.id));
    const number = (numberRow?.maximum || 0) + 1;
    if (number > 32_767) {
      throw new OpenDotaError(
        409,
        "journal_day_full",
        "ظرفیت ثبت مچ برای این روز تکمیل شده است",
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

    const [activePool] = await tx
      .select({ id: heroPoolVersions.id })
      .from(heroPoolVersions)
      .where(and(eq(heroPoolVersions.userId, userId), eq(heroPoolVersions.isActive, true)))
      .limit(1);

    const [saved] = await tx
      .insert(journalMatches)
      .values({
        userId,
        dayId: day.id,
        dotaMatchId: match.match_id,
        source: "opendota",
        number,
        heroId: player.hero_id,
        heroName,
        role: null,
        roleSource: null,
        heroPoolVersionId: activePool?.id || null,
        heroPoolEligible,
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
        analyzedAt: now,
        createdAt: startedAt,
        updatedAt: now,
      })
      .returning({ id: journalMatches.id });

    await tx
      .insert(stratzEnrichmentJobs)
      .values({ matchId: saved.id, runAfter: now, updatedAt: now })
      .onConflictDoNothing({ target: stratzEnrichmentJobs.matchId });

    await tx
      .insert(matchImageJobs)
      .values({ matchId: saved.id, runAfter: now, updatedAt: now })
      .onConflictDoUpdate({
        target: matchImageJobs.matchId,
        set: {
          status: "pending",
          attempts: 0,
          runAfter: now,
          lockedAt: null,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          updatedAt: now,
        },
        setWhere: ne(matchImageJobs.status, "processing"),
      });

    await tx.update(users).set({ updatedAt: now }).where(eq(users.id, userId));
    return {
      created: true as const,
      dismissed: false as const,
      journalMatchId: saved.id,
      dotaMatchId: match.match_id,
      day: dayKey,
    };
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
  const heroPoolEligible = isHeroPoolEligibleMode(match.game_mode, match.lobby_type);

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`journal-match:${journalMatchId}`}, 0))`,
    );

    const [ownedMatch] = await tx
      .select({
        id: journalMatches.id,
        role: journalMatches.role,
        roleSource: journalMatches.roleSource,
        heroPoolVersionId: journalMatches.heroPoolVersionId,
      })
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

    const [activePool] = ownedMatch.heroPoolVersionId
      ? [{ id: ownedMatch.heroPoolVersionId }]
      : await tx
          .select({ id: heroPoolVersions.id })
          .from(heroPoolVersions)
          .where(and(eq(heroPoolVersions.userId, userId), eq(heroPoolVersions.isActive, true)))
          .limit(1);

    const [saved] = await tx
      .update(journalMatches)
      .set({
        dotaMatchId: match.match_id,
        source: "opendota",
        heroId: player.hero_id,
        heroName,
        role:
          ownedMatch.roleSource === "manual" || ownedMatch.roleSource === "stratz"
            ? ownedMatch.role
            : null,
        roleSource:
          ownedMatch.roleSource === "manual" || ownedMatch.roleSource === "stratz"
            ? ownedMatch.roleSource
            : null,
        heroPoolVersionId: activePool?.id || null,
        heroPoolEligible,
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
        analyzedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(journalMatches.id, journalMatchId),
          eq(journalMatches.userId, userId),
        ),
      )
      .returning();

    await tx
      .delete(matchBans)
      .where(
        and(
          eq(matchBans.matchId, journalMatchId),
          eq(matchBans.source, "opendota"),
        ),
      );

    await tx
      .insert(stratzEnrichmentJobs)
      .values({ matchId: journalMatchId, runAfter: now, updatedAt: now })
      .onConflictDoUpdate({
        target: stratzEnrichmentJobs.matchId,
        set: {
          status: "pending",
          attempts: 0,
          runAfter: now,
          lockedAt: null,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          updatedAt: now,
        },
        setWhere: ne(stratzEnrichmentJobs.status, "processing"),
      });

    await tx
      .insert(matchImageJobs)
      .values({ matchId: saved.id, runAfter: now, updatedAt: now })
      .onConflictDoUpdate({
        target: matchImageJobs.matchId,
        set: {
          status: "pending",
          attempts: 0,
          runAfter: now,
          lockedAt: null,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          updatedAt: now,
        },
        setWhere: ne(matchImageJobs.status, "processing"),
      });

    await tx
      .delete(dismissedDotaMatches)
      .where(
        and(
          eq(dismissedDotaMatches.userId, userId),
          eq(dismissedDotaMatches.dotaMatchId, match.match_id),
        ),
      );

    await tx.update(users).set({ updatedAt: now }).where(eq(users.id, userId));
    return saved;
  });
}
