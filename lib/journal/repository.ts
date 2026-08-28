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
import { extractMatchDetails } from "@/lib/dota/match-details";
import { gameModeName, lobbyTypeName } from "@/lib/dota/modes";
import {
  dismissedDotaMatches,
  dotaMatches,
  heroPoolEntries,
  heroPoolVersions,
  journalDays,
  journalMatches,
  matchBans,
  matchPicks,
  matchImageJobs,
  matchImages,
  users,
} from "@/lib/db/schema";
import {
  deleteStoredObject,
  isStorageNotFound,
} from "@/lib/storage/client";
import { collectDismissedDotaMatchIds } from "./dismissed";
import { makePublicImageUrl } from "@/lib/storage/media";
import type { DayInput, PublicPlayerIdentifier } from "./validation";
import { toJournalDateKey } from "./timezone";

interface JournalOwner {
  id: string;
  handle: string;
  steamId?: string;
  steamAccountId?: number;
  displayName?: string;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DateRange {
  from: string;
  to: string;
}

async function deleteRemovedMatchImage(objectKey: string) {
  try {
    await deleteStoredObject(objectKey);
  } catch (error) {
    if (!isStorageNotFound(error)) {
      console.warn("Unable to delete image for removed journal match", {
        objectKey,
      });
    }
  }
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
          rawData: dotaMatches.rawData,
        })
        .from(journalMatches)
        .leftJoin(
          dotaMatches,
          eq(journalMatches.dotaMatchId, dotaMatches.matchId),
        )
        .where(inArray(journalMatches.dayId, dayIds))
        .orderBy(asc(journalMatches.number))
    : [];
  const matchIds = matchRows.map((match) => match.id);
  const banRows = matchIds.length
    ? await db
        .select()
        .from(matchBans)
        .where(inArray(matchBans.matchId, matchIds))
        .orderBy(asc(matchBans.sortOrder))
    : [];
  const pickRows = matchIds.length
    ? await db
        .select()
        .from(matchPicks)
        .where(inArray(matchPicks.matchId, matchIds))
        .orderBy(asc(matchPicks.sortOrder))
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
  const picksByMatch = new Map<string, typeof pickRows>();

  banRows.forEach((ban) => {
    const bans = bansByMatch.get(ban.matchId) || [];
    bans.push(ban);
    bansByMatch.set(ban.matchId, bans);
  });
  pickRows.forEach((pick) => {
    const picks = picksByMatch.get(pick.matchId) || [];
    picks.push(pick);
    picksByMatch.set(pick.matchId, picks);
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
              const rolePool = match.heroPoolVersionId && match.role
                ? poolHeroIds.get(`${match.heroPoolVersionId}:${match.role}`)
                : null;

              return [
                match.id,
                {
                id: match.id,
                number: match.number,
                heroId: match.heroId,
                heroName: match.heroName,
                bans: (bansByMatch.get(match.id) || [])
                  .map((ban) => ({
                    id: ban.heroId,
                    name: ban.heroName,
                    source: ban.source,
                    team: ban.team,
                    draftOrder: ban.draftOrder,
                    inRolePool: Boolean(rolePool?.has(ban.heroId)),
                  }))
                  .sort((left, right) => Number(right.inRolePool) - Number(left.inRolePool) || (left.draftOrder ?? 999) - (right.draftOrder ?? 999)),
                picks: (picksByMatch.get(match.id) || []).map((pick) => ({
                  id: pick.heroId,
                  name: pick.heroName,
                  playerSlot: pick.playerSlot,
                  team: pick.team,
                  inRolePool: Boolean(rolePool?.has(pick.heroId)),
                })),
                legacyBans: match.legacyBans,
                role: match.role || "",
                roleSource: match.roleSource,
                heroPoolEligible: match.heroPoolEligible,
                heroPoolMatch:
                  match.heroPoolEligible && match.heroPoolVersionId && match.role && match.heroId
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

export async function saveJournalDay(userId: string, dateKey: string, input: DayInput) {
  const db = getDb();
  const now = new Date();
  const removedImageKeys: string[] = [];

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
      })
      .from(journalMatches)
      .where(
        and(
          eq(journalMatches.userId, userId),
          eq(journalMatches.dayId, day.id),
        ),
      );
    const existingIds = new Set(existingMatches.map((match) => match.id));
    const existingById = new Map(existingMatches.map((match) => [match.id, match]));
    const incomingMatches = Object.values(input.matches);
    const incomingIds = new Set(incomingMatches.map((match) => match.id));
    const removedIds = existingMatches
      .map((match) => match.id)
      .filter((id) => !incomingIds.has(id));

    if (removedIds.length) {
      const dismissedMatchIds = collectDismissedDotaMatchIds(
        existingMatches,
        incomingIds,
      );
      if (dismissedMatchIds.length) {
        await tx
          .insert(dismissedDotaMatches)
          .values(
            dismissedMatchIds.map((dotaMatchId) => ({
              userId,
              dotaMatchId,
              dismissedAt: now,
            })),
          )
          .onConflictDoNothing();
      }

      const removedImages = await tx
        .select({ objectKey: matchImages.objectKey })
        .from(matchImages)
        .where(inArray(matchImages.matchId, removedIds));
      removedImageKeys.push(...removedImages.map((image) => image.objectKey));

      await tx
        .delete(journalMatches)
        .where(
          and(
            eq(journalMatches.userId, userId),
            eq(journalMatches.dayId, day.id),
            inArray(journalMatches.id, removedIds),
          ),
        );
    }

    for (const match of incomingMatches) {
      const existing = existingById.get(match.id);
      const nextRole = match.role || null;
      const values = {
        number: match.number,
        heroId: match.heroId,
        heroName: match.heroName,
        role: nextRole,
        roleSource: nextRole
          ? existing?.role === nextRole
            ? existing.roleSource || "manual" as const
            : "manual" as const
          : null,
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
            inArray(matchBans.source, ["opendota", "stratz"]),
          ),
        )
        .limit(1);

      await tx
        .delete(matchBans)
        .where(and(eq(matchBans.matchId, match.id), eq(matchBans.source, "manual")));

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

  await Promise.allSettled(removedImageKeys.map(deleteRemovedMatchImage));

  const owner = await findJournalOwnerById(userId);
  if (!owner) throw new Error("Journal owner disappeared after saving");

  return loadJournalProfile(owner, { from: dateKey, to: dateKey });
}
