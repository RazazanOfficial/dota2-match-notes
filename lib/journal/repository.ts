import {
  and,
  asc,
  eq,
  getTableColumns,
  gte,
  inArray,
  lte,
  sql,
} from "drizzle-orm";
import { heroById } from "@/data/heroes";
import { getDb } from "@/lib/db";
import { normalizeProfile } from "@/lib/date";
import { extractMatchDetails } from "@/lib/dota/match-details";
import { gameModeName, lobbyTypeName } from "@/lib/dota/modes";
import {
  dotaMatches,
  heroPoolEntries,
  heroPoolVersions,
  journalDays,
  journalMatches,
  matchBans,
  matchImageJobs,
  matchImages,
  openDotaParseJobs,
  users,
} from "@/lib/db/schema";
import { matchAnalysisStatus } from "@/lib/opendota/analysis-policy";
import { hasParsedOpenDotaReplay } from "@/lib/opendota/validation";
import { makePublicImageUrl } from "@/lib/storage/media";
import type { DayInput, PublicPlayerIdentifier } from "./validation";
import { toJournalDateKey } from "./timezone";
import { journalMatchSummary } from "./match-summary";
import { estimatedOpenDotaRole, openDotaDraft } from "@/lib/opendota/match-derived";
import type { Day, Match } from "@/lib/types";

export interface JournalOwner {
  id: string;
  handle: string;
  steamId?: string;
  steamAccountId?: number;
  displayName?: string;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalMatchPageData {
  owner: JournalOwner;
  dateKey: string;
  day: Day;
  match: Match;
}

interface DateRange {
  from: string;
  to: string;
}

export async function findJournalOwnerById(id: string) {
  const [owner] = await getDb()
    .select({
      id: users.id,
      handle: users.handle,
      steamId: users.steamId,
      steamAccountId: users.steamAccountId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return owner || null;
}

export async function findJournalOwnerByIdentifier(
  identifier: PublicPlayerIdentifier,
) {
  const condition =
    identifier.kind === "steam_id"
      ? eq(users.steamId, identifier.value)
      : identifier.kind === "account_id"
        ? eq(users.steamAccountId, identifier.value)
        : sql`lower(${users.handle}) = ${identifier.value}`;

  const [owner] = await getDb()
    .select({
      id: users.id,
      handle: users.handle,
      steamId: users.steamId,
      steamAccountId: users.steamAccountId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(condition)
    .limit(1);

  return owner || null;
}

export async function loadJournalProfile(owner: JournalOwner, range: DateRange) {
  const db = getDb();
  const dayRows = await db
    .select()
    .from(journalDays)
    .where(
      and(
        eq(journalDays.userId, owner.id),
        gte(journalDays.day, range.from),
        lte(journalDays.day, range.to),
      ),
    )
    .orderBy(asc(journalDays.day));
  const dayIds = dayRows.map((day) => day.id);
  const matchRows = dayIds.length
    ? await db
        .select({
          ...getTableColumns(journalMatches),
          gameModeId: dotaMatches.gameMode,
          lobbyTypeId: dotaMatches.lobbyType,
          radiantWin: dotaMatches.radiantWin,
          rawData: journalMatchSummary,
          localReplayReady: sql<boolean>`${dotaMatches.localReplayData} is not null
            and ${dotaMatches.localReplayData}->>'match_id' = ${dotaMatches.matchId}::text`,
          parseStatus: openDotaParseJobs.status,
          parseErrorCode: openDotaParseJobs.errorCode,
        })
        .from(journalMatches)
        .leftJoin(
          dotaMatches,
          eq(journalMatches.dotaMatchId, dotaMatches.matchId),
        )
        .leftJoin(
          openDotaParseJobs,
          eq(journalMatches.id, openDotaParseJobs.matchId),
        )
        .where(inArray(journalMatches.dayId, dayIds))
        .orderBy(asc(journalMatches.number))
    : [];
  const matchIds = matchRows.map((match) => match.id);
  const banRows = matchIds.length
    ? await db
        .select()
        .from(matchBans)
        .where(and(inArray(matchBans.matchId, matchIds), eq(matchBans.source, "manual")))
        .orderBy(asc(matchBans.sortOrder))
    : [];
  const poolVersionIds = [...new Set(matchRows.map((match) => match.heroPoolVersionId).filter((id): id is string => Boolean(id)))];
  const [poolEntryRows, poolVersionRows] = poolVersionIds.length
    ? await Promise.all([
        db.select().from(heroPoolEntries).where(inArray(heroPoolEntries.poolVersionId, poolVersionIds)),
        db.select({ id: heroPoolVersions.id, version: heroPoolVersions.version })
          .from(heroPoolVersions)
          .where(inArray(heroPoolVersions.id, poolVersionIds)),
      ])
    : [[], []];
  const [imageRows, imageJobRows] = matchIds.length
    ? await Promise.all([
        db
          .select()
          .from(matchImages)
          .where(inArray(matchImages.matchId, matchIds))
          .orderBy(asc(matchImages.sortOrder)),
        db
          .select({
            matchId: matchImageJobs.matchId,
            status: matchImageJobs.status,
          })
          .from(matchImageJobs)
          .where(inArray(matchImageJobs.matchId, matchIds)),
      ])
    : [[], []];
  const bansByMatch = new Map<string, typeof banRows>();

  banRows.forEach((ban) => {
    const bans = bansByMatch.get(ban.matchId) || [];
    bans.push(ban);
    bansByMatch.set(ban.matchId, bans);
  });
  const poolHeroIds = new Map<string, Set<number>>();
  poolEntryRows.forEach((entry) => {
    const key = `${entry.poolVersionId}:${entry.role}`;
    const heroes = poolHeroIds.get(key) || new Set<number>();
    heroes.add(entry.heroId);
    poolHeroIds.set(key, heroes);
  });
  const poolVersionNumber = new Map(poolVersionRows.map((version) => [version.id, version.version]));
  const imagesByMatch = new Map<string, Array<{
    id: string;
    publicUrl: string;
    altText: string;
    width: number | null;
    height: number | null;
    sortOrder: number;
  }>>();
  imageRows.forEach((image) => {
    const images = imagesByMatch.get(image.matchId) || [];
    images.push({
      id: image.id,
      publicUrl: makePublicImageUrl(image.objectKey),
      altText: image.altText,
      width: image.width,
      height: image.height,
      sortOrder: image.sortOrder,
    });
    imagesByMatch.set(image.matchId, images);
  });
  const imageJobByMatch = new Map(
    imageJobRows.map((job) => [job.matchId, job.status]),
  );

  const matchesByDay = new Map<string, typeof matchRows>();
  matchRows.forEach((match) => {
    const matches = matchesByDay.get(match.dayId) || [];
    matches.push(match);
    matchesByDay.set(match.dayId, matches);
  });

  return {
    username: owner.handle,
    registeredDate: toJournalDateKey(owner.createdAt),
    createdAt: owner.createdAt.toISOString(),
    updatedAt: owner.updatedAt.toISOString(),
    days: Object.fromEntries(
      dayRows.map((day) => [
        day.day,
        {
          completed: day.completed,
          matches: Object.fromEntries(
            (matchesByDay.get(day.id) || []).map((match) => {
              const details = extractMatchDetails(
                match.rawData,
                owner.steamAccountId,
                match.heroId,
              );
              const estimatedRole = estimatedOpenDotaRole(match.rawData, owner.steamAccountId, match.heroId);
              const role = match.roleSource === "manual" ? match.role : estimatedRole;
              const draft = openDotaDraft(match.rawData, match.heroId);
              const manualBans = bansByMatch.get(match.id) || [];
              const bans = draft.bans.length ? draft.bans : manualBans.map((ban) => ({
                id: ban.heroId, name: ban.heroName, source: "manual" as const,
                team: ban.team, draftOrder: ban.draftOrder,
              }));
              const rolePool = match.heroPoolVersionId && role
                ? poolHeroIds.get(`${match.heroPoolVersionId}:${role}`)
                : null;

              return [
                match.id,
                {
                id: match.id,
                number: match.number,
                heroId: match.heroId,
                heroName: match.heroName,
                bans: bans
                  .map((ban) => ({
                    ...ban,
                    inRolePool: Boolean(rolePool?.has(ban.id)),
                  }))
                  .sort((left, right) => Number(right.inRolePool) - Number(left.inRolePool) || (left.draftOrder ?? 999) - (right.draftOrder ?? 999)),
                picks: draft.picks.map((pick) => ({
                  ...pick,
                  inRolePool: Boolean(rolePool?.has(pick.id)),
                })),
                legacyBans: match.legacyBans,
                role: role || "",
                roleSource: match.roleSource === "manual" ? "manual" : estimatedRole ? "opendota" : null,
                positionOverrides: match.positionOverrides || {},
                heroPoolEligible: match.heroPoolEligible,
                heroPoolMatch:
                  match.heroPoolEligible && match.heroPoolVersionId && role && match.heroId
                    ? Boolean(rolePool?.has(match.heroId))
                    : null,
                heroPoolVersion: match.heroPoolVersionId
                  ? poolVersionNumber.get(match.heroPoolVersionId) || null
                  : null,
                queueType: match.queueType || "",
                notes: match.notes,
                positivePoints: match.positivePoints,
                negativePoints: match.negativePoints,
                result: match.result,
                source: match.source,
                dotaMatchId:
                  match.dotaMatchId === null
                    ? null
                    : String(match.dotaMatchId),
                startedAt: match.startedAt?.toISOString() || null,
                durationSeconds: match.durationSeconds,
                kills: match.kills,
                deaths: match.deaths,
                assists: match.assists,
                goldPerMinute: match.goldPerMinute,
                xpPerMinute: match.xpPerMinute,
                netWorth: match.netWorth,
                heroDamage: match.heroDamage,
                towerDamage: match.towerDamage,
                gameModeId: match.gameModeId,
                gameModeName: gameModeName(match.gameModeId),
                lobbyTypeId: match.lobbyTypeId,
                lobbyTypeName: lobbyTypeName(match.lobbyTypeId),
                radiantWin: details.radiantWin ?? match.radiantWin ?? null,
                radiantScore: details.radiantScore,
                direScore: details.direScore,
                participants: details.participants.map((participant) => ({
                  ...participant,
                  inRolePool: Boolean(rolePool?.has(participant.heroId)),
                })),
                images: imagesByMatch.get(match.id) || [],
                imageJobStatus: imageJobByMatch.get(match.id) || null,
                analysisStatus: matchAnalysisStatus({
                  replayParsed: Boolean(match.localReplayReady ||
                    (match.rawData && hasParsedOpenDotaReplay(match.rawData as Record<string, unknown>))),
                  parseStatus: match.parseStatus,
                  startedAt: match.startedAt,
                }),
                analysisErrorCode: match.parseErrorCode,
                createdAt: match.createdAt.toISOString(),
                updatedAt: match.updatedAt.toISOString(),
                },
              ] as const;
            }),
          ),
        },
      ]),
    ),
  };
}

/**
 * Resolve one journal entry for the standalone match page. Imported matches use
 * their public Dota match id; legacy/manual entries can still use their UUID.
 * Numeric Dota ids can be opened publicly. When no owner is supplied we select
 * one stored journal copy; adding ?player= keeps the viewed player explicit.
 */
export async function loadJournalMatchPage(
  reference: string,
  ownerId?: string,
): Promise<JournalMatchPageData | null> {
  const normalized = reference.trim();
  const isDotaMatchId = /^\d{1,20}$/.test(normalized);
  const isJournalMatchId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized,
    );

  if (!isDotaMatchId && !isJournalMatchId) return null;

  const dotaMatchId = isDotaMatchId ? Number(normalized) : null;
  if (isDotaMatchId && (!Number.isSafeInteger(dotaMatchId) || dotaMatchId! <= 0)) {
    return null;
  }

  const conditions = isDotaMatchId
    ? ownerId
      ? and(eq(journalMatches.userId, ownerId), eq(journalMatches.dotaMatchId, dotaMatchId!))
      : eq(journalMatches.dotaMatchId, dotaMatchId!)
    : eq(journalMatches.id, normalized);

  const [target] = await getDb()
    .select({
      matchId: journalMatches.id,
      dateKey: journalDays.day,
      ownerId: users.id,
      handle: users.handle,
      steamId: users.steamId,
      steamAccountId: users.steamAccountId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(journalMatches)
    .innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
    .innerJoin(users, eq(journalMatches.userId, users.id))
    .where(conditions)
    .limit(1);

  if (!target) return null;

  const owner: JournalOwner = {
    id: target.ownerId,
    handle: target.handle,
    steamId: target.steamId,
    steamAccountId: target.steamAccountId,
    displayName: target.displayName,
    avatarUrl: target.avatarUrl,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  };
  const rawProfile = await loadJournalProfile(owner, {
    from: target.dateKey,
    to: target.dateKey,
  });
  const profile = normalizeProfile(rawProfile, owner.handle);
  const day = profile.days[target.dateKey];
  const match = day?.matches.find((candidate) => candidate.id === target.matchId);

  if (!day || !match) return null;
  return { owner, dateKey: target.dateKey, day, match };
}

export async function saveJournalDay(userId: string, dateKey: string, input: DayInput) {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${dateKey}`}, 0))`,
    );

    const [day] = await tx
      .insert(journalDays)
      .values({
        userId,
        day: dateKey,
        completed: input.completed,
      })
      .onConflictDoUpdate({
        target: [journalDays.userId, journalDays.day],
        set: {
          completed: input.completed,
          updatedAt: now,
        },
      })
      .returning({ id: journalDays.id });
    const existingMatches = await tx
      .select({
        id: journalMatches.id,
        dotaMatchId: journalMatches.dotaMatchId,
        role: journalMatches.role,
        roleSource: journalMatches.roleSource,
        rawData: dotaMatches.rawData,
      })
      .from(journalMatches)
      .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
      .where(
        and(
          eq(journalMatches.userId, userId),
          eq(journalMatches.dayId, day.id),
        ),
      );
    const existingIds = new Set(existingMatches.map((match) => match.id));
    const existingById = new Map(existingMatches.map((match) => [match.id, match]));
    const incomingMatches = Object.values(input.matches);
    // Saving is intentionally non-destructive: omitted matches are preserved.
    // This prevents stale clients and crafted save payloads from deleting history.

    for (const match of incomingMatches) {
      const existing = existingById.get(match.id);
      const nextRole = match.role || null;
      const estimatedRole = estimatedOpenDotaRole(existing?.rawData, undefined, match.heroId);
      const roleSource = !nextRole ? null
        : existing?.roleSource === "manual" && existing.role === nextRole ? "manual" as const
        : nextRole === estimatedRole ? "opendota" as const : "manual" as const;
      const values = {
        number: match.number,
        heroId: match.heroId,
        heroName: match.heroName,
        role: nextRole,
        roleSource,
        positionOverrides: match.positionOverrides || {},
        queueType: match.queueType || null,
        notes: match.notes,
        positivePoints: match.positivePoints,
        negativePoints: match.negativePoints,
        legacyBans: match.legacyBans,
        result: match.result,
        updatedAt: now,
      } as const;

      if (existingIds.has(match.id)) {
        await tx
          .update(journalMatches)
          .set(values)
          .where(
            and(
              eq(journalMatches.id, match.id),
              eq(journalMatches.userId, userId),
              eq(journalMatches.dayId, day.id),
            ),
          );
      } else {
        await tx.insert(journalMatches).values({
          id: match.id,
          userId,
          dayId: day.id,
          source: "manual",
          createdAt: new Date(match.createdAt),
          ...values,
        });
      }

      const [automaticBan] = await tx
        .select({ id: matchBans.id })
        .from(matchBans)
        .where(
          and(
            eq(matchBans.matchId, match.id),
            eq(matchBans.source, "opendota"),
          ),
        )
        .limit(1);

      await tx
        .delete(matchBans)
        .where(and(eq(matchBans.matchId, match.id), inArray(matchBans.source, ["manual", "stratz"])));

      if (!automaticBan && match.banIds.length) {
        await tx.insert(matchBans).values(
          match.banIds.map((heroId, sortOrder) => ({
            matchId: match.id,
            heroId,
            heroName: heroById(heroId)?.name || String(heroId),
            sortOrder,
            source: "manual" as const,
          })),
        );
      }
    }

    await tx.update(users).set({ updatedAt: now }).where(eq(users.id, userId));
  });

  const owner = await findJournalOwnerById(userId);
  if (!owner) throw new Error("Journal owner disappeared after saving");

  return loadJournalProfile(owner, { from: dateKey, to: dateKey });
}
