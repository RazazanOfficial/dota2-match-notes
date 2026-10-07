import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { HttpRequest } from "../../../http/protocol";
import { getRequestUser } from "../../../lib/auth/request";
import { getDb } from "../../../lib/db";
import { dotaMatches, journalDays, journalMatches, localReplayJobs } from "../../../lib/db/schema";
import { parseDateRange } from "../../../lib/journal/validation";
import { historyPositionSql, historyScoreSql, refreshHistoryAnalysis, replayParsedSql, summaryCurrentSql } from "../../../lib/dota/history-analysis";

const PAGE_SIZE = 8;

/** Small, paginated match rows: no replay or raw provider JSON is loaded. */
export async function GET(request: HttpRequest) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
  const range = parseDateRange(request.parsedUrl.searchParams);
  if (!range.success) return Response.json({ ok: false, error: { code: "invalid_date_range" } }, { status: 400 });
  const params = request.parsedUrl.searchParams;
  const page = Number(params.get("page") || "1");
  const query = (params.get("query") || "").trim();
  const mode = params.get("mode") || "all";
  const position = params.get("position") || "all";
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000 || query.length > 64 ||
      !["all", "Ranked", "Turbo", "All Pick", "Captains Mode", "Single Draft", "All Random", "Random Draft", "Ability Draft", "Other"].includes(mode) ||
      !["all", "0", "1", "2", "3", "4", "5"].includes(position)) {
    return Response.json({ ok: false, error: { code: "invalid_match_filters" } }, { status: 400 });
  }
  const summaryPending = await refreshHistoryAnalysis(user.id, range.data.from, range.data.to);
  const filters = [eq(journalMatches.userId, user.id), gte(journalDays.day, range.data.from), lte(journalDays.day, range.data.to)];
  if (query) {
    const escaped = query.replace(/[\\%_]/g, "\\$&");
    filters.push(or(ilike(journalMatches.heroName, `%${escaped}%`),
      sql`${journalMatches.dotaMatchId}::text like ${`%${escaped}%`} escape '\\'`)!);
  }
  if (position !== "all") filters.push(sql`${historyPositionSql} = ${Number(position)}`);
  if (mode === "Turbo") filters.push(eq(dotaMatches.gameMode, 23));
  if (mode === "Ranked") filters.push(or(eq(dotaMatches.lobbyType, 5), eq(dotaMatches.lobbyType, 6), eq(dotaMatches.lobbyType, 7))!);
  if (mode === "All Pick") filters.push(and(sql`${dotaMatches.gameMode} in (1, 22)`,
    or(sql`${dotaMatches.lobbyType} is null`, sql`${dotaMatches.lobbyType} not in (5, 6, 7)`))!);
  const modes: Record<string, number[]> = { "Captains Mode": [2, 16], "Single Draft": [3], "All Random": [4], "Random Draft": [18], "Ability Draft": [11] };
  if (modes[mode]) filters.push(and(sql`${dotaMatches.gameMode} in (${sql.join(modes[mode].map(value => sql`${value}`), sql`, `)})`, sql`coalesce(${dotaMatches.lobbyType}, 0) not in (5,6,7)`)!);
  if (mode === "Other") filters.push(and(sql`coalesce(${dotaMatches.gameMode}, 0) not in (1,2,3,4,11,16,18,22,23)`, sql`coalesce(${dotaMatches.lobbyType}, 0) not in (5,6,7)`)!);
  const condition = and(...filters);
  const db = getDb();
  const source = () => db.select({
    id: journalMatches.id, dotaMatchId: journalMatches.dotaMatchId,
    heroId: journalMatches.heroId, heroName: journalMatches.heroName,
    position: historyPositionSql, score: historyScoreSql, result: journalMatches.result,
    kills: journalMatches.kills, deaths: journalMatches.deaths, assists: journalMatches.assists,
    startedAt: journalMatches.startedAt, day: journalDays.day,
    duration: journalMatches.durationSeconds,
    gameMode: dotaMatches.gameMode, lobbyType: dotaMatches.lobbyType,
    parsed: replayParsedSql, projectionCurrent: summaryCurrentSql, projectionReady: sql<boolean>`${summaryCurrentSql} and coalesce((${journalMatches.analysisSummary}->>'ready')::boolean, false)`,
    jobStatus: localReplayJobs.status, jobIntent: localReplayJobs.intent,
  }).from(journalMatches).innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
    .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .leftJoin(localReplayJobs, eq(journalMatches.dotaMatchId, localReplayJobs.matchId)).where(condition);
  const [rows, totals, heroes, positions] = await Promise.all([
    source().orderBy(desc(journalMatches.startedAt), desc(journalMatches.createdAt), desc(journalMatches.id))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int`, wins: sql<number>`count(*) filter (where ${journalMatches.result} = 'win')::int`, score: sql<number | null>`avg(${historyScoreSql})` })
      .from(journalMatches).innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
      .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId)).where(condition),
    db.select({ id: journalMatches.heroId, count: sql<number>`count(*)::int`, wins: sql<number>`count(*) filter (where ${journalMatches.result} = 'win')::int` })
      .from(journalMatches).innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
      .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
      .where(condition).groupBy(journalMatches.heroId),
    db.select({ id: historyPositionSql, count: sql<number>`count(*)::int`, wins: sql<number>`count(*) filter (where ${journalMatches.result} = 'win')::int` })
      .from(journalMatches).innerJoin(journalDays, eq(journalMatches.dayId, journalDays.id))
      .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
      .where(condition).groupBy(historyPositionSql),
  ]);
  const total = totals[0]?.total || 0, wins = totals[0]?.wins || 0;
  const segments = (data: { id: number | null; count: number; wins: number }[]) =>
    data.filter(row => row.id != null).map(row => ({ id: row.id!, count: row.count, wins: row.wins, losses: row.count - row.wins }));
  return Response.json({ ok: true, page, pageSize: PAGE_SIZE, total, summaryPending,
    rows: rows.map(row => ({ id: row.dotaMatchId ? String(row.dotaMatchId) : row.id,
      journalId: row.id, heroId: row.heroId, heroName: row.heroName,
      position: row.position || null, won: row.result === "win",
      k: row.kills, d: row.deaths, a: row.assists, score: row.score,
      mode: row.gameMode === 23 ? "Turbo" : [5, 6, 7].includes(row.lobbyType || 0) ? "Ranked" : [1,22].includes(row.gameMode || 0) ? "All Pick" : Object.entries(modes).find(([, ids]) => ids.includes(row.gameMode || 0))?.[0] || "Other",
      duration: row.duration, startedAt: row.startedAt?.toISOString() || `${row.day}T12:00:00.000Z`,
      analyzed: row.parsed && row.projectionReady,
      analysisStatus: row.parsed ? (!row.projectionCurrent ? "processing" : row.projectionReady ? "ready" : "failed") : row.jobIntent === "analysis" && ["pending", "processing", "failed"].includes(row.jobStatus || "") ? row.jobStatus : "basic",
    })),
    summary: { total, wins, losses: total - wins, winRate: total ? wins / total * 100 : 0, score: totals[0]?.score == null ? null : Number(totals[0].score),
      heroes: segments(heroes), positions: segments(positions) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
