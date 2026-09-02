import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dotaMatches,
  heroBenchmarkDistributions,
  heroPositionMeta,
  journalMatches,
  performanceReferenceSnapshots,
  users,
} from "@/lib/db/schema";
import { buildMatchAnalysis } from "./match-analysis";
import type { PerformanceReferenceData } from "./performance-cohort";

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

async function loadPerformanceReference(heroIds: number[]): Promise<PerformanceReferenceData | undefined> {
  if (!heroIds.length) return undefined;
  const db = getDb();
  const [snapshot] = await db
    .select()
    .from(performanceReferenceSnapshots)
    .where(eq(performanceReferenceSnapshots.status, "active"))
    .orderBy(desc(performanceReferenceSnapshots.activatedAt))
    .limit(1);
  if (!snapshot) return undefined;

  // These rows come exclusively from the external worker snapshot. The site's
  // journal matches are never used as a statistical population.
  const [selectedMeta, totals, benchmarks] = await Promise.all([
    db.select().from(heroPositionMeta).where(and(
      eq(heroPositionMeta.snapshotId, snapshot.id),
      inArray(heroPositionMeta.heroId, heroIds),
    )),
    db.select({
      position: heroPositionMeta.position,
      rankBracket: heroPositionMeta.rankBracket,
      gameMode: heroPositionMeta.gameMode,
      count: sql<number>`sum(${heroPositionMeta.matchCount})::integer`,
    }).from(heroPositionMeta)
      .where(eq(heroPositionMeta.snapshotId, snapshot.id))
      .groupBy(heroPositionMeta.position, heroPositionMeta.rankBracket, heroPositionMeta.gameMode),
    db.select().from(heroBenchmarkDistributions).where(and(
      eq(heroBenchmarkDistributions.snapshotId, snapshot.id),
      inArray(heroBenchmarkDistributions.heroId, heroIds),
    )),
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
      fetchedAt: snapshot.fetchedAt?.toISOString() ?? null,
      expiresAt: snapshot.expiresAt?.toISOString() ?? null,
      windowDays: snapshot.windowDays,
      stale: !snapshot.expiresAt || snapshot.expiresAt.getTime() < Date.now(),
    },
    meta,
    benchmarks: benchmarks.map((row) => ({
      heroId: row.heroId,
      position: row.position,
      rankBracket: row.rankBracket,
      gameMode: row.gameMode,
      patch: row.patch,
      metric: row.metric,
      provider: row.provider,
      sampleCount: row.sampleCount,
      quantiles: row.quantiles,
    })),
  };
}

export async function loadPublicMatchAnalysis(journalMatchId: string) {
  const [source] = await getDb()
    .select({
      dotaMatchId: journalMatches.dotaMatchId,
      profileHeroId: journalMatches.heroId,
      profileAssignedRole: journalMatches.role,
      positionOverrides: journalMatches.positionOverrides,
      profileAccountId: users.steamAccountId,
      rawData: dotaMatches.rawData,
      stratzRawData: dotaMatches.stratzRawData,
    })
    .from(journalMatches)
    .innerJoin(users, eq(journalMatches.userId, users.id))
    .leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId))
    .where(eq(journalMatches.id, journalMatchId))
    .limit(1);
  if (!source) return { found: false as const, analysis: null };
  if (!source.dotaMatchId || !source.rawData) return { found: true as const, analysis: null };

  const rawPlayers = Array.isArray(source.rawData.players) ? source.rawData.players : [];
  const heroIds = [...new Set(rawPlayers.flatMap((value) => {
    const heroId = numberValue(record(value)?.hero_id);
    return heroId === null ? [] : [heroId];
  }))];
  let performanceReference: PerformanceReferenceData | undefined;
  try {
    performanceReference = await loadPerformanceReference(heroIds);
  } catch (error) {
    console.warn("External performance reference unavailable; using embedded payload only", error);
  }
  return {
    found: true as const,
    analysis: buildMatchAnalysis({
      rawData: source.rawData,
      stratzRawData: source.stratzRawData,
      profileAccountId: source.profileAccountId,
      profileHeroId: source.profileHeroId,
      profileAssignedRole: source.profileAssignedRole,
      positionOverrides: source.positionOverrides,
      performanceReference,
    }),
  };
}
