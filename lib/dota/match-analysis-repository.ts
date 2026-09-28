import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dotaMatches,
  journalMatches,
  monthlyHeroPositionMeta,
  monthlyHeroPerformance,
  monthlyPositionPerformance,
  monthlyReferenceVersions,
  users,
} from "@/lib/db/schema";
import { buildMatchAnalysis } from "./match-analysis";
import type { PerformanceReferenceData } from "./performance-cohort";
import { hasParsedOpenDotaReplay } from "@/lib/opendota/validation";
import { overlayReplayData } from "@/lib/replay/overlay";
import { weekStartsInMonth } from "@/lib/monthly-reference/model";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadPerformanceReference(heroIds: number[], matchStart: unknown): Promise<PerformanceReferenceData | undefined> {
  const started = numberValue(matchStart);
  if (!heroIds.length || !started || !Number.isSafeInteger(started)) return undefined;
  const matchDate = new Date(started * 1_000);
  if (Number.isNaN(matchDate.getTime())) return undefined;
  const referenceMonth = new Date(Date.UTC(matchDate.getUTCFullYear(), matchDate.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const db = getDb();
  const [snapshot] = await db
    .select()
    .from(monthlyReferenceVersions)
    .where(and(eq(monthlyReferenceVersions.status, "active"), eq(monthlyReferenceVersions.referenceMonth, referenceMonth)))
    .orderBy(desc(monthlyReferenceVersions.completedAt))
    .limit(1);
  if (!snapshot) return undefined;

  // These rows come exclusively from the external worker snapshot. The site's
  // journal matches are never used as a statistical population.
  const [selectedMeta, totals, heroLane, positionLane] = await Promise.all([
    db.select().from(monthlyHeroPositionMeta).where(and(
      eq(monthlyHeroPositionMeta.versionId, snapshot.id),
      inArray(monthlyHeroPositionMeta.heroId, heroIds),
    )),
    db.select({
      position: monthlyHeroPositionMeta.position,
      rankBracket: monthlyHeroPositionMeta.rankBracket,
      gameMode: monthlyHeroPositionMeta.gameMode,
      count: sql<number>`sum(${monthlyHeroPositionMeta.matchCount})::integer`,
    }).from(monthlyHeroPositionMeta)
      .where(eq(monthlyHeroPositionMeta.versionId, snapshot.id))
      .groupBy(monthlyHeroPositionMeta.position, monthlyHeroPositionMeta.rankBracket, monthlyHeroPositionMeta.gameMode),
    db.select().from(monthlyHeroPerformance).where(and(eq(monthlyHeroPerformance.versionId, snapshot.id),
      eq(monthlyHeroPerformance.minute, 11), eq(monthlyHeroPerformance.rankGroup, "DIVINE_IMMORTAL"),
      inArray(monthlyHeroPerformance.heroId, heroIds))),
    db.select().from(monthlyPositionPerformance).where(and(eq(monthlyPositionPerformance.versionId, snapshot.id),
      eq(monthlyPositionPerformance.minute, 11), eq(monthlyPositionPerformance.rankGroup, "DIVINE_IMMORTAL"))),
  ]);
  const positionTotals = new Map<string, number>();
  for (const row of totals) {
    const key = `${row.position}:${row.rankBracket}:${row.gameMode}`;
    positionTotals.set(key, Number(row.count));
  }
  const meta = selectedMeta.map((row) => ({
    heroId: row.heroId,
    position: row.position,
    rankBracket: row.rankBracket,
    gameMode: row.gameMode,
    matchCount: row.matchCount,
    winCount: row.winCount,
    positionShare: row.positionShare,
    metaPickRate: row.metaPickRate,
    winRate: row.winRate,
    positionSampleCount: positionTotals.get(`${row.position}:${row.rankBracket}:${row.gameMode}`) ?? row.matchCount,
  }));
  return {
    snapshot: {
      id: snapshot.id,
      fetchedAt: snapshot.completedAt?.toISOString() ?? null,
      expiresAt: null,
      windowDays: weekStartsInMonth(new Date(`${referenceMonth}T00:00:00Z`)).length * 7,
      stale: false,
      referenceMonth,
    },
    meta,
    benchmarks: [],
    lane: { month: referenceMonth, versionId: snapshot.id,
      hero: heroLane.map(row => ({ heroId: row.heroId, position: row.position, sampleCount: row.sampleCount,
        cs: row.cs, dn: row.dn, kills: row.kills, deaths: row.deaths, assists: row.assists, networth: row.networth })),
      position: positionLane.map(row => ({ position: row.position, sampleCount: row.sampleCount,
        cs: row.cs, dn: row.dn, kills: row.kills, deaths: row.deaths, assists: row.assists, networth: row.networth })) },
  };
}

export async function loadPublicMatchAnalysis(journalMatchId: string, requestedPositionOverrides?:Record<string,number>) {
  const [source] = await getDb()
    .select({
      dotaMatchId: journalMatches.dotaMatchId,
      profileHeroId: journalMatches.heroId,
      profileAssignedRole: sql<"safe_lane" | "mid_lane" | "off_lane" | "soft_support" | "hard_support" | null>`case when ${journalMatches.roleSource} = 'manual' then ${journalMatches.role} else null end`,
      positionOverrides: journalMatches.positionOverrides,
      profileAccountId: users.steamAccountId,
      rawData: dotaMatches.rawData,
      localReplayData: dotaMatches.localReplayData,
    })
    .from(journalMatches)
    .innerJoin(users, eq(journalMatches.userId, users.id))
    .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .where(eq(journalMatches.id, journalMatchId))
    .limit(1);
  if (!source) return { found: false as const, analysis: null, replayParsed: false };
  if (!source.dotaMatchId || !source.rawData) return { found: true as const, analysis: null, replayParsed: false };
  const overlaid = overlayReplayData(source.rawData, source.localReplayData);
  const replayParsed = hasParsedOpenDotaReplay(overlaid.match);

  const rawPlayers = Array.isArray(overlaid.match.players) ? overlaid.match.players : [];
  const heroIds = [...new Set(rawPlayers.flatMap((value) => {
    const heroId = numberValue(record(value)?.hero_id);
    return heroId === null ? [] : [heroId];
  }))];
  let performanceReference: PerformanceReferenceData | undefined;
  try {
    performanceReference = await loadPerformanceReference(heroIds, record(source.rawData)?.start_time);
  } catch (error) {
    console.warn("External performance reference unavailable; using embedded payload only", error);
  }
  return {
    found: true as const,
    replayParsed,
    analysis: buildMatchAnalysis({
      rawData: overlaid.match,
      replaySource: overlaid.source,
      profileAccountId: source.profileAccountId,
      profileHeroId: source.profileHeroId,
      profileAssignedRole: source.profileAssignedRole,
      positionOverrides: requestedPositionOverrides
        ? { ...(source.positionOverrides || {}), ...requestedPositionOverrides }
        : source.positionOverrides,
      performanceReference,
    }),
  };
}

export async function loadStandaloneMatchAnalysis(matchId: number, profileAccountId: number, requestedPositionOverrides?: Record<string, number>) {
  const [source] = await getDb().select({ rawData: dotaMatches.rawData, localReplayData: dotaMatches.localReplayData })
    .from(dotaMatches).where(eq(dotaMatches.matchId, matchId)).limit(1);
  if (!source?.rawData) return { found: false as const, replayParsed: false, analysis: null };
  const overlaid = overlayReplayData(source.rawData, source.localReplayData);
  const replayParsed = hasParsedOpenDotaReplay(overlaid.match);
  const rawPlayers = Array.isArray(overlaid.match.players) ? overlaid.match.players : [];
  const heroIds = [...new Set(rawPlayers.flatMap((value) => {
    const heroId = numberValue(record(value)?.hero_id);
    return heroId === null ? [] : [heroId];
  }))];
  let performanceReference: PerformanceReferenceData | undefined;
  try { performanceReference = await loadPerformanceReference(heroIds, record(source.rawData)?.start_time); }
  catch (error) { console.warn("External performance reference unavailable", error); }
  return {
    found: true as const,
    replayParsed,
    analysis: replayParsed ? buildMatchAnalysis({ rawData: overlaid.match, replaySource: overlaid.source,
      profileAccountId, positionOverrides: requestedPositionOverrides, performanceReference }) : null,
  };
}
