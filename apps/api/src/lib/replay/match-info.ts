import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { dotaMatches, journalMatches } from "../db/schema";
import { historyPositionSql, historyScoreSql, replayParsedSql, summaryCurrentSql } from "../dota/history-analysis";

/** Account-specific, bounded replay metadata. No upstream request, quota claim or replay parsing. */
export async function replayMatchInfo(matchId: number, userId: string, accountId: number) {
  const player = sql<unknown>`(select jsonb_build_object('hero_id', p->'hero_id', 'player_slot', p->'player_slot')
    from jsonb_array_elements(case when jsonb_typeof(${dotaMatches.rawData}->'players')='array'
      then ${dotaMatches.rawData}->'players' else '[]'::jsonb end) p
    where p->>'account_id'=${String(accountId)} limit 1)`;
  const [row] = await getDb().select({
    matchId: dotaMatches.matchId, startedAt: dotaMatches.startedAt,
    duration: sql<number | null>`coalesce(${dotaMatches.durationSeconds}, case when ${dotaMatches.rawData}->>'duration' ~ '^[0-9]{1,9}$' then (${dotaMatches.rawData}->>'duration')::integer else null end)`,
    gameMode: sql<number | null>`coalesce(${dotaMatches.gameMode}, case when ${dotaMatches.rawData}->>'game_mode' ~ '^[0-9]{1,9}$' then (${dotaMatches.rawData}->>'game_mode')::integer else null end)`,
    lobbyType: sql<number | null>`coalesce(${dotaMatches.lobbyType}, case when ${dotaMatches.rawData}->>'lobby_type' ~ '^[0-9]{1,9}$' then (${dotaMatches.rawData}->>'lobby_type')::integer else null end)`,
    radiantWin: sql<boolean | null>`coalesce(${dotaMatches.radiantWin}, case when ${dotaMatches.rawData}->>'radiant_win' in ('true','false') then (${dotaMatches.rawData}->>'radiant_win')::boolean else null end)`,
    player, journalId: journalMatches.id, heroId: journalMatches.heroId, result: journalMatches.result,
    position: historyPositionSql, score: historyScoreSql,
    analyzed: sql<boolean>`${replayParsedSql} and ${summaryCurrentSql} and coalesce((${journalMatches.analysisSummary}->>'ready')::boolean, false)`,
  }).from(dotaMatches).leftJoin(journalMatches,
    and(eq(journalMatches.dotaMatchId, dotaMatches.matchId), eq(journalMatches.userId, userId)))
    .where(eq(dotaMatches.matchId, matchId)).limit(1);
  if (!row) return null;
  const participant = row.player as { hero_id?: number; player_slot?: number } | null;
  const slot = participant?.player_slot;
  const won = typeof slot === "number" && row.radiantWin != null
    ? (slot < 128) === row.radiantWin
    : row.journalId && ["win", "loss"].includes(row.result || "") ? row.result === "win" : null;
  const modes: Record<number, string> = { 1: "All Pick", 22: "All Pick", 2: "Captains Mode", 16: "Captains Draft", 3: "Single Draft", 4: "All Random", 18: "Random Draft", 11: "Ability Draft" };
  return {
    matchId, heroId: participant?.hero_id || row.heroId || null, won,
    position: row.position || null, score: row.score == null ? null : Number(row.score), analyzed: !!row.analyzed,
    mode: row.gameMode === 23 ? "Turbo" : [5, 6, 7].includes(row.lobbyType || 0) ? "Ranked" : modes[row.gameMode || 0] || "Other",
    duration: row.duration, startedAt: row.startedAt?.toISOString() || null,
  };
}
