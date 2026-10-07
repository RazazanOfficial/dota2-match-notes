import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { dotaMatches, journalDays, journalMatches } from "../db/schema";
import { referenceRevisionSql } from "./analysis-summary-version";
import { loadPublicMatchAnalysis } from "./match-analysis-repository";

const players = sql`case when jsonb_typeof(${dotaMatches.rawData}->'players') = 'array' then ${dotaMatches.rawData}->'players' else '[]'::jsonb end`;
export const replayParsedSql = sql<boolean>`coalesce((
  (${dotaMatches.localReplayData}->>'match_id' = ${dotaMatches.matchId}::text
    and jsonb_array_length(case when jsonb_typeof(${dotaMatches.localReplayData}->'players') = 'array' then ${dotaMatches.localReplayData}->'players' else '[]'::jsonb end) = 10)
  or (${dotaMatches.rawData}->>'version' ~ '^[1-9][0-9]*$' and jsonb_array_length(${players}) > 0)
  or exists(select 1 from jsonb_array_elements(${players}) p where
    jsonb_array_length(case when jsonb_typeof(p->'times') = 'array' then p->'times' else '[]'::jsonb end) > 1
    and (jsonb_typeof(p->'gold_t') = 'array' or jsonb_typeof(p->'xp_t') = 'array' or jsonb_typeof(p->'lh_t') = 'array'))
), false)`;
export const summaryCurrentSql = sql<boolean>`coalesce((
  ${journalMatches.analysisSummary}->>'version' = '1'
  and (${journalMatches.analysisSummary}->>'sourceUpdatedAt')::timestamptz = date_trunc('milliseconds', ${dotaMatches.updatedAt})
  and ${journalMatches.analysisSummary}->>'referenceRevision' = ${referenceRevisionSql}
  and ${journalMatches.analysisSummary}->'positionOverrides' = ${journalMatches.positionOverrides}
  and (${journalMatches.analysisSummary}->>'heroId')::integer is not distinct from ${journalMatches.heroId}
  and ${journalMatches.analysisSummary}->>'assignedRole' is not distinct from
    (case when ${journalMatches.roleSource} = 'manual' then ${journalMatches.role}::text else null end)
), false)`;
export const historyPositionSql = sql<number>`case when ${replayParsedSql} and ${summaryCurrentSql}
  then coalesce((${journalMatches.analysisSummary}->>'position')::integer, 0)
  else case ${journalMatches.role} when 'safe_lane' then 1 when 'mid_lane' then 2 when 'off_lane' then 3 when 'soft_support' then 4 when 'hard_support' then 5 else 0 end end`;
export const historyScoreSql = sql<number | null>`case when ${replayParsedSql} and ${summaryCurrentSql}
  then (${journalMatches.analysisSummary}->>'score')::double precision else null end`;

const inFlight = new Map<string, Promise<unknown>>();
async function refresh(id: string) {
  if (!inFlight.has(id)) inFlight.set(id, loadPublicMatchAnalysis(id).finally(() => inFlight.delete(id)));
  return inFlight.get(id);
}

/** Old analyses are projected in small batches; raw replay payloads never travel to the history client. */
export async function refreshHistoryAnalysis(userId: string, from: string, to: string) {
  const db = getDb();
  const condition = and(eq(journalMatches.userId, userId), gte(journalDays.day, from), lte(journalDays.day, to),
    sql`${dotaMatches.rawData} is not null`, replayParsedSql, sql`not ${summaryCurrentSql}`);
  const rows = await db.select({ id: journalMatches.id }).from(journalMatches)
    .innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
    .innerJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .where(condition).orderBy(desc(journalMatches.startedAt)).limit(8);
  // Two at a time bounds CPU and database work for a cold monthly history.
  for (let i = 0; i < rows.length; i += 2) await Promise.all(rows.slice(i, i + 2).map(row => refresh(row.id)));
  const pending = await db.select({ id: journalMatches.id }).from(journalMatches)
    .innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
    .innerJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId)).where(condition).limit(1);
  return pending.length > 0;
}

export async function refreshMatchAnalysisSummaries(matchId: number) {
  const rows = await getDb().select({ id: journalMatches.id }).from(journalMatches).where(eq(journalMatches.dotaMatchId, matchId));
  for (const row of rows) await refresh(row.id);
}
