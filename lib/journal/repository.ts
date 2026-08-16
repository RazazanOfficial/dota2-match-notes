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
import { gameModeName, lobbyTypeName } from "@/lib/dota/modes";
import {
  dismissedDotaMatches,
  dotaMatches,
  journalDays,
  journalMatches,
  matchBans,
  matchImages,
  users,
} from "@/lib/db/schema";
import {
  deleteStoredObject,
  isStorageNotFound,
} from "@/lib/storage/client";
import { collectDismissedDotaMatchIds } from "./dismissed";
import type { DayInput } from "./validation";

interface JournalOwner {
  id: string;
  handle: string;
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
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return owner || null;
}

export async function findJournalOwnerByHandle(handle: string) {
  const [owner] = await getDb()
    .select({
      id: users.id,
      handle: users.handle,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(sql`lower(${users.handle}) = ${handle}`)
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
  const bansByMatch = new Map<string, number[]>();

  banRows.forEach((ban) => {
    const bans = bansByMatch.get(ban.matchId) || [];
    bans.push(ban.heroId);
    bansByMatch.set(ban.matchId, bans);
  });

  const matchesByDay = new Map<string, typeof matchRows>();
  matchRows.forEach((match) => {
    const matches = matchesByDay.get(match.dayId) || [];
    matches.push(match);
    matchesByDay.set(match.dayId, matches);
  });

  return {
    username: owner.handle,
    createdAt: owner.createdAt.toISOString(),
    updatedAt: owner.updatedAt.toISOString(),
    days: Object.fromEntries(
      dayRows.map((day) => [
        day.day,
        {
          completed: day.completed,
          matches: Object.fromEntries(
            (matchesByDay.get(day.id) || []).map((match) => [
              match.id,
              {
                id: match.id,
                number: match.number,
                heroId: match.heroId,
                heroName: match.heroName,
                banIds: bansByMatch.get(match.id) || [],
                legacyBans: match.legacyBans,
                role: match.role || "",
                queueType: match.queueType || "",
                notes: match.notes,
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
                createdAt: match.createdAt.toISOString(),
                updatedAt: match.updatedAt.toISOString(),
              },
            ]),
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
      })
      .from(journalMatches)
      .where(
        and(
          eq(journalMatches.userId, userId),
          eq(journalMatches.dayId, day.id),
        ),
      );
    const existingIds = new Set(existingMatches.map((match) => match.id));
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
      const values = {
        number: match.number,
        heroId: match.heroId,
        heroName: match.heroName,
        role: match.role || null,
        queueType: match.queueType || null,
        notes: match.notes,
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

      await tx.delete(matchBans).where(eq(matchBans.matchId, match.id));

      if (match.banIds.length) {
        await tx.insert(matchBans).values(
          match.banIds.map((heroId, sortOrder) => ({
            matchId: match.id,
            heroId,
            heroName: heroById(heroId)?.name || String(heroId),
            sortOrder,
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
