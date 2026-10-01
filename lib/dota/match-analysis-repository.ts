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
import { referenceMonthsForMatch, weekStartsInMonth } from "@/lib/monthly-reference/model";
import { poolDivineImmortalMeta } from "@/lib/monthly-reference/selection";

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
  const [preferredMonth, fallbackMonth] = referenceMonthsForMatch(matchDate);
  const db = getDb();
  const [snapshot] = await db
    .select()
    .from(monthlyReferenceVersions)
    .where(and(eq(monthlyReferenceVersions.status, "active"),
      inArray(monthlyReferenceVersions.referenceMonth, [preferredMonth, fallbackMonth])))
    .orderBy(desc(monthlyReferenceVersions.referenceMonth), desc(monthlyReferenceVersions.completedAt))
    .limit(1);
  if (!snapshot) return undefined;
  const referenceMonth = snapshot.referenceMonth;

  // These rows come exclusively from the external worker snapshot. The site's
  // journal matches are never used as a statistical population.
  const [selectedMeta, totals, heroLane, positionLane] = await Promise.all([
    db.select().from(monthlyHeroPositionMeta).where(and(
      eq(monthlyHeroPositionMeta.versionId, snapshot.id),
      inArray(monthlyHeroPositionMeta.heroId, heroIds),
      inArray(monthlyHeroPositionMeta.rankBracket, ["DIVINE", "IMMORTAL"]),
    )),
    db.select({
      position: monthlyHeroPositionMeta.position,
      gameMode: monthlyHeroPositionMeta.gameMode,
      count: sql<number>`sum(${monthlyHeroPositionMeta.matchCount})::integer`,
    }).from(monthlyHeroPositionMeta)
      .where(and(eq(monthlyHeroPositionMeta.versionId, snapshot.id),
        inArray(monthlyHeroPositionMeta.rankBracket, ["DIVINE", "IMMORTAL"])))
      .groupBy(monthlyHeroPositionMeta.position, monthlyHeroPositionMeta.gameMode),
    db.select().from(monthlyHeroPerformance).where(and(eq(monthlyHeroPerformance.versionId, snapshot.id),
      eq(monthlyHeroPerformance.minute, 11), eq(monthlyHeroPerformance.rankGroup, "DIVINE_IMMORTAL"),
      inArray(monthlyHeroPerformance.heroId, heroIds))),
    db.select().from(monthlyPositionPerformance).where(and(eq(monthlyPositionPerformance.versionId, snapshot.id),
      eq(monthlyPositionPerformance.minute, 11), eq(monthlyPositionPerformance.rankGroup, "DIVINE_IMMORTAL"))),
  ]);
  const meta = poolDivineImmortalMeta(selectedMeta, totals.map(row => ({
    position: row.position, gameMode: row.gameMode, count: Number(row.count),
  })));
  return {
    snapshot: {
      id: snapshot.id,
      fetchedAt: snapshot.completedAt?.toISOString() ?? null,
      expiresAt: null,
      windowDays: weekStartsInMonth(new Date(`${referenceMonth}T00:00:00Z`)).length * 7,
      stale: referenceMonth !== preferredMonth,
      referenceMonth,
      requestedReferenceMonth: preferredMonth,
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
