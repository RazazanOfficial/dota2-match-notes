import { asc, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { PlayerSearchResult } from "@/lib/types";
import {
  normalizePlayerSearchQuery,
  PLAYER_SEARCH_MAX_LENGTH,
  PLAYER_SEARCH_MIN_LENGTH,
  PLAYER_SEARCH_RESULT_LIMIT,
} from "./validation";

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function searchPublicPlayers(
  rawQuery: string,
): Promise<PlayerSearchResult[]> {
  const query = normalizePlayerSearchQuery(rawQuery);
  if (
    query.length < PLAYER_SEARCH_MIN_LENGTH ||
    query.length > PLAYER_SEARCH_MAX_LENGTH
  ) {
    return [];
  }

  const escaped = escapeLike(query);
  const containsPattern = `%${escaped}%`;
  const prefixPattern = `${escaped}%`;
  const normalized = query.toLowerCase();

  return getDb()
    .select({
      steamId: users.steamId,
      steamAccountId: users.steamAccountId,
      handle: users.handle,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      or(
        ilike(users.displayName, containsPattern),
        ilike(users.handle, containsPattern),
        ilike(users.steamId, containsPattern),
        sql`${users.steamAccountId}::text ilike ${containsPattern}`,
      ),
    )
    .orderBy(
      sql<number>`case
        when lower(${users.displayName}) = ${normalized} then 0
        when lower(${users.handle}) = ${normalized} then 0
        when ${users.steamId} = ${query} then 0
        when ${users.steamAccountId}::text = ${query} then 0
        when lower(${users.displayName}) like lower(${prefixPattern}) then 1
        when lower(${users.handle}) like lower(${prefixPattern}) then 1
        when ${users.steamId} like ${prefixPattern} then 1
        when ${users.steamAccountId}::text like ${prefixPattern} then 1
        else 2
      end`,
      asc(users.displayName),
      asc(users.steamAccountId),
    )
    .limit(PLAYER_SEARCH_RESULT_LIMIT);
}
