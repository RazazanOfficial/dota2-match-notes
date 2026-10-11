import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { monthlyHeroPerformance, monthlyHeroPositionMeta, monthlyPositionPerformance, monthlyReferenceEvents, monthlyReferenceVersions } from "../db/schema";
import { METRICS, MODES, RANKS, RANK_GROUPS, REFERENCE_POLICY, monthDate, monthIsSettled, monthKey, performanceJobs, previousMonth, referenceWindow, type Means } from "./model";
import { fetchMonthlyMeta, fetchMonthlyPerformance, type PerformanceRow } from "./providers";
import { META_SOURCE_RECHECK_MS, MonthlyMetaPendingError, pendingMetaRetryAt } from "./availability";

const LOCK = 2_741_073;
const metaTasks = RANKS.flatMap(rank => MODES.map(mode => ({ rank, mode })));
const rankMembers: Record<string, string[]> = {
  DIVINE_IMMORTAL: ["DIVINE", "IMMORTAL"],
};
const meanColumns = {
  cs: "cs", dn: "dn", kills: "kills", deaths: "deaths", assists: "assists", networth: "networth", xp: "xp",
  heroDamage: "hero_damage", towerDamage: "tower_damage", healingAllies: "healing_allies",
  campsStacked: "camps_stacked", neutrals: "neutrals", ancients: "ancients", teamKills: "team_kills",
} as const;

async function locked<T>(run: (tx: ReturnType<typeof getDb>) => Promise<T>) {
  // Drizzle's transaction is used below so all progress checks and writes are atomic.
  return getDb().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK})`);
    return run(tx as unknown as ReturnType<typeof getDb>);
  });
}

export async function ensureMonthlyReference(now = new Date(), force = false, requestedMonth?: string) {
  if (requestedMonth && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth)) throw new Error("Invalid reference month");
  const month = requestedMonth ? new Date(`${requestedMonth}-01T00:00:00Z`) : previousMonth(now);
  if (month > previousMonth(now)) throw new Error("Reference month has not ended");
  if ((now.getUTCFullYear() - month.getUTCFullYear()) * 12 + now.getUTCMonth() - month.getUTCMonth() > 11) throw new Error("Reference backfill is limited to the last 11 months");
  if (!monthIsSettled(month, now)) return { status: "waiting-week", month: monthDate(month) };
  return locked(async tx => {
    const monthString = monthDate(month);
    const [building] = await tx.select().from(monthlyReferenceVersions)
      .where(and(eq(monthlyReferenceVersions.referenceMonth, monthString), eq(monthlyReferenceVersions.status, "building"),
        eq(monthlyReferenceVersions.sourcePolicy, REFERENCE_POLICY))).limit(1);
    if (building && !force) return { status: "building", month: monthString, versionId: building.id };
    const [active] = await tx.select().from(monthlyReferenceVersions)
      .where(and(eq(monthlyReferenceVersions.referenceMonth, monthString), eq(monthlyReferenceVersions.status, "active"),
        eq(monthlyReferenceVersions.sourcePolicy, REFERENCE_POLICY))).limit(1);
    if (active && !force) return { status: "active", month: monthString, versionId: active.id };
    // A fresh version never deletes the active fallback or mixes existing rows.
    // Superseded builders remain visible as failed history; in-flight writers
    // check their version/status under the same lock before committing.
    await tx.update(monthlyReferenceVersions).set({ status: "failed", updatedAt: now,
      errorMessage: "این اجرا با نسخهٔ جدید مرجع جایگزین شد؛ اطلاعات مرجع فعال حفظ شده است." })
      .where(and(eq(monthlyReferenceVersions.referenceMonth, monthString), eq(monthlyReferenceVersions.status, "building")));
    const [created] = await tx.insert(monthlyReferenceVersions).values({ referenceMonth: monthString, sourcePolicy: REFERENCE_POLICY }).returning({ id: monthlyReferenceVersions.id });
    await tx.insert(monthlyReferenceEvents).values({ versionId: created.id, service: "system", level: "info",
      message: `${force ? "بازخوانی دستی از صفر" : "ساخت خودکار مرجع"}؛ مبنا: هفته‌های STRATZ از ${referenceWindow(month).start} تا ${referenceWindow(month).endExclusive} (پایان بازه غیرشامل، UTC)؛ مرجع فعال قبلی حفظ می‌شود` });
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const lower = monthString, upper = monthDate(end), suffix = monthKey(month);
    // Suffix and date values only come from Date UTC year/month, never request text.
    for (const parent of ["monthly_hero_position_meta", "monthly_hero_performance_reference", "monthly_position_performance_reference"]) {
      await tx.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "${parent}_${suffix}" PARTITION OF "${parent}" FOR VALUES FROM ('${lower}') TO ('${upper}')`));
    }
    return { status: "created", month: lower, versionId: created.id };
  });
}

async function buildingVersion() {
  return (await getDb().select().from(monthlyReferenceVersions)
    .where(and(eq(monthlyReferenceVersions.status, "building"), eq(monthlyReferenceVersions.sourcePolicy, REFERENCE_POLICY)))
    .orderBy(monthlyReferenceVersions.referenceMonth).limit(1))[0];
}

export async function runMonthlyMetaTick(now = new Date()) {
  const version = await buildingVersion();
  if (!version) return { status: "idle" as const };
  const task = metaTasks[version.metaCursor];
  if (!task) return { status: "complete" as const, versionId: version.id };
  const waiting = (retryAt: Date) => ({ status: "waiting-source" as const, versionId: version.id,
    referenceMonth: version.referenceMonth, retryAt: retryAt.toISOString() });
  const retryAt = pendingMetaRetryAt(version.metaLastError, version.metaLastErrorAt, now);
  if (retryAt) return waiting(retryAt);
  const month = new Date(`${version.referenceMonth}T00:00:00Z`);
  let rows: Awaited<ReturnType<typeof fetchMonthlyMeta>>;
  try { rows = await fetchMonthlyMeta(month, task.rank, task.mode); }
  catch (error) {
    if (!(error instanceof MonthlyMetaPendingError)) throw error;
    return locked(async tx => {
      const [current] = await tx.select().from(monthlyReferenceVersions).where(eq(monthlyReferenceVersions.id, version.id)).limit(1);
      if (!current || current.metaCursor !== version.metaCursor || current.status !== "building") return { status: "advanced" as const };
      const alreadyWaiting = pendingMetaRetryAt(current.metaLastError, current.metaLastErrorAt, now);
      if (alreadyWaiting) return waiting(alreadyWaiting);
      await tx.update(monthlyReferenceVersions).set({ metaLastError: error.message,
        metaLastErrorAt: now, updatedAt: now, errorMessage: null }).where(eq(monthlyReferenceVersions.id, version.id));
      await tx.insert(monthlyReferenceEvents).values({ versionId: version.id, service: "meta", level: "info", message: error.message });
      const nextRetryAt = new Date(now.getTime() + META_SOURCE_RECHECK_MS);
      console.info("Monthly Meta waiting for source", { referenceMonth: version.referenceMonth,
        latestAvailableWeek: error.availableWeeks.at(-1), missingWeeks: error.missingWeeks, position: error.position, retryAt: nextRetryAt.toISOString() });
      return waiting(nextRetryAt);
    });
  }
  return locked(async tx => {
    const [current] = await tx.select().from(monthlyReferenceVersions).where(eq(monthlyReferenceVersions.id, version.id)).limit(1);
    if (!current || current.metaCursor !== version.metaCursor || current.status !== "building") return { status: "advanced" as const };
    for (let i = 0; i < rows.length; i += 300) {
      await tx.insert(monthlyHeroPositionMeta).values(rows.slice(i, i + 300).map(row => ({ ...row, referenceMonth: version.referenceMonth, versionId: version.id })));
    }
    await tx.update(monthlyReferenceVersions).set({ metaCursor: version.metaCursor + 1, metaRows: version.metaRows + rows.length,
      metaLastSuccessAt: new Date(), metaLastError: null, updatedAt: new Date(), errorMessage: null }).where(eq(monthlyReferenceVersions.id, version.id));
    await tx.insert(monthlyReferenceEvents).values({ versionId: version.id, service: "meta", level: "success",
      message: `${task.rank} / ${task.mode.name} / ${referenceWindow(month).weekStarts.length} هفته و هر پنج پوزیشن: ${rows.length} ردیف؛ ${version.metaCursor + 1} از ${metaTasks.length}${version.metaCursor + 1 === metaTasks.length ? "؛ Meta هفتگی کامل شد" : ""}` });
    return { status: "progress" as const, versionId: version.id, completed: version.metaCursor + 1, total: metaTasks.length, rows: rows.length };
  });
}

export function qualifiesHeroPosition(metaCount: number, heroTotal: number, performanceCount = metaCount) {
  const samples = Math.min(metaCount, performanceCount);
  return samples >= 1000 || (samples >= 500 && heroTotal > 0 && metaCount / heroTotal >= .2);
}

function eligible(meta: Array<{ heroId: number; position: number; rankBracket: string; matchCount: number }>, rankGroup: string) {
  const members = new Set(rankMembers[rankGroup]);
  const counts = new Map<string, number>(), heroTotals = new Map<number, number>();
  for (const row of meta) {
    if (!members.has(row.rankBracket)) continue;
    const key = `${row.heroId}:${row.position}`;
    counts.set(key, (counts.get(key) ?? 0) + row.matchCount);
    heroTotals.set(row.heroId, (heroTotals.get(row.heroId) ?? 0) + row.matchCount);
  }
  return new Set([...counts].filter(([key, count]) => qualifiesHeroPosition(count, heroTotals.get(Number(key.split(":")[0])) ?? 0)).map(([key]) => key));
}

async function pruneUnderSampledHeroRows(tx: ReturnType<typeof getDb>, versionId: string) {
  const [meta, atTwelve] = [
    await
    tx.select({ heroId: monthlyHeroPositionMeta.heroId, position: monthlyHeroPositionMeta.position,
      rankBracket: monthlyHeroPositionMeta.rankBracket, matchCount: monthlyHeroPositionMeta.matchCount })
      .from(monthlyHeroPositionMeta).where(and(eq(monthlyHeroPositionMeta.versionId, versionId), eq(monthlyHeroPositionMeta.gameMode, 22))),
    await tx.select({ heroId: monthlyHeroPerformance.heroId, position: monthlyHeroPerformance.position,
      rankGroup: monthlyHeroPerformance.rankGroup, sampleCount: monthlyHeroPerformance.sampleCount })
      .from(monthlyHeroPerformance).where(and(eq(monthlyHeroPerformance.versionId, versionId), eq(monthlyHeroPerformance.minute, 13))),
  ];
  const byGroup = new Map<string, ReturnType<typeof eligible>>();
  for (const group of RANK_GROUPS) byGroup.set(group, eligible(meta, group));
  const metaCounts = new Map<string, number>(), totals = new Map<string, number>();
  for (const row of meta) for (const group of RANK_GROUPS) {
    if (!rankMembers[group].includes(row.rankBracket)) continue;
    const key = `${group}:${row.heroId}:${row.position}`, hero = `${group}:${row.heroId}`;
    metaCounts.set(key, (metaCounts.get(key) ?? 0) + row.matchCount);
    totals.set(hero, (totals.get(hero) ?? 0) + row.matchCount);
  }
  const performanceCounts = new Map(atTwelve.map(row => [`${row.rankGroup}:${row.heroId}:${row.position}`, row.sampleCount]));
  const allRows = await tx.select({ heroId: monthlyHeroPerformance.heroId, position: monthlyHeroPerformance.position,
    rankGroup: monthlyHeroPerformance.rankGroup }).from(monthlyHeroPerformance)
    .where(eq(monthlyHeroPerformance.versionId, versionId)).groupBy(monthlyHeroPerformance.heroId,
      monthlyHeroPerformance.position, monthlyHeroPerformance.rankGroup);
  const rejected = allRows.filter(row => {
    const key = `${row.rankGroup}:${row.heroId}:${row.position}`;
    return !byGroup.get(row.rankGroup)?.has(`${row.heroId}:${row.position}`) ||
      !qualifiesHeroPosition(metaCounts.get(key) ?? 0, totals.get(`${row.rankGroup}:${row.heroId}`) ?? 0,
        performanceCounts.get(key) ?? 0);
  });
  for (let i = 0; i < rejected.length; i += 100) {
    const batch = rejected.slice(i, i + 100);
    await tx.delete(monthlyHeroPerformance).where(and(eq(monthlyHeroPerformance.versionId, versionId),
      or(...batch.map(row => and(eq(monthlyHeroPerformance.heroId, row.heroId),
        eq(monthlyHeroPerformance.position, row.position), eq(monthlyHeroPerformance.rankGroup, row.rankGroup))))));
  }
  return rejected.length;
}

function mergeMeans(table: typeof monthlyHeroPerformance | typeof monthlyPositionPerformance) {
  const currentCount = table.sampleCount;
  return Object.fromEntries(METRICS.map(metric => {
    const column = table[metric];
    const excluded = sql.raw(`excluded."${meanColumns[metric]}"`);
    return [metric, sql`(${column} * ${currentCount} + ${excluded} * excluded.sample_count) / (${currentCount} + excluded.sample_count)`];
  })) as Record<keyof Means, ReturnType<typeof sql>>;
}

async function insertRows(tx: ReturnType<typeof getDb>, version: { id: string; referenceMonth: string }, rows: PerformanceRow[], allowed: Set<string>) {
  // Each source row represents one distinct hero, position, week and minute;
  // weight by the number of matches still present at that minute.
  const heroRows = rows.filter(row => allowed.has(`${row.heroId}:${row.position}`)).map(row => ({
    referenceMonth: version.referenceMonth, versionId: version.id, heroId: row.heroId,
    position: row.position, rankGroup: row.rankGroup, minute: row.minute, sampleCount: row.sampleCount, ...row.means,
  }));
  const groups = new Map<string, Omit<typeof heroRows[number], "heroId">>();
  for (const row of rows) {
    const key = `${row.position}:${row.rankGroup}:${row.minute}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { referenceMonth: version.referenceMonth, versionId: version.id,
        position: row.position, rankGroup: row.rankGroup, minute: row.minute, sampleCount: row.sampleCount, ...row.means });
      continue;
    }
    for (const metric of METRICS) existing[metric] = (existing[metric] * existing.sampleCount + row.means[metric] * row.sampleCount) / (existing.sampleCount + row.sampleCount);
    existing.sampleCount += row.sampleCount;
  }
  for (let i = 0; i < heroRows.length; i += 200) {
    await tx.insert(monthlyHeroPerformance).values(heroRows.slice(i, i + 200)).onConflictDoUpdate({
      target: [monthlyHeroPerformance.referenceMonth, monthlyHeroPerformance.versionId, monthlyHeroPerformance.heroId,
        monthlyHeroPerformance.position, monthlyHeroPerformance.rankGroup, monthlyHeroPerformance.minute],
      set: { ...mergeMeans(monthlyHeroPerformance), sampleCount: sql`${monthlyHeroPerformance.sampleCount} + excluded.sample_count` },
    });
  }
  const positionRows = [...groups.values()];
  for (let i = 0; i < positionRows.length; i += 200) {
    await tx.insert(monthlyPositionPerformance).values(positionRows.slice(i, i + 200)).onConflictDoUpdate({
      target: [monthlyPositionPerformance.referenceMonth, monthlyPositionPerformance.versionId,
        monthlyPositionPerformance.position, monthlyPositionPerformance.rankGroup, monthlyPositionPerformance.minute],
      set: { ...mergeMeans(monthlyPositionPerformance), sampleCount: sql`${monthlyPositionPerformance.sampleCount} + excluded.sample_count` },
    });
  }
}

export async function runMonthlyPerformanceTick() {
  const version = await buildingVersion();
  if (!version || version.metaCursor < metaTasks.length) return { status: "waiting-meta" as const };
  const jobs = performanceJobs(new Date(`${version.referenceMonth}T00:00:00Z`));
  const job = jobs[version.performanceCursor];
  if (!job) return { status: "complete" as const, versionId: version.id };
  const meta = await getDb().select({ heroId: monthlyHeroPositionMeta.heroId, position: monthlyHeroPositionMeta.position,
    rankBracket: monthlyHeroPositionMeta.rankBracket, matchCount: monthlyHeroPositionMeta.matchCount })
    .from(monthlyHeroPositionMeta).where(and(eq(monthlyHeroPositionMeta.versionId, version.id),
      eq(monthlyHeroPositionMeta.gameMode, 22), inArray(monthlyHeroPositionMeta.rankBracket, rankMembers[job.rank]),
      inArray(monthlyHeroPositionMeta.heroId, job.heroIds)));
  const allowed = eligible(meta, job.rank);
  const rows = await fetchMonthlyPerformance(job);
  // We reject an unexpectedly empty batch; leaving the cursor in place permits retry.
  if (!rows.length) throw new Error(`STRATZ returned no stats for ${job.rank}, ${job.week}, heroes ${job.heroIds.join(",")}`);
  return locked(async tx => {
    const [current] = await tx.select().from(monthlyReferenceVersions).where(eq(monthlyReferenceVersions.id, version.id)).limit(1);
    if (!current || current.performanceCursor !== version.performanceCursor || current.status !== "building") return { status: "advanced" as const };
    await insertRows(tx, version, rows, allowed);
    const last = version.performanceCursor + 1 === jobs.length;
    const pruned = last ? await pruneUnderSampledHeroRows(tx, version.id) : 0;
    const counts = last ? [
      await tx.select({ total: sql<number>`count(*)::integer` }).from(monthlyHeroPerformance).where(eq(monthlyHeroPerformance.versionId, version.id)),
      await tx.select({ total: sql<number>`count(*)::integer` }).from(monthlyPositionPerformance).where(eq(monthlyPositionPerformance.versionId, version.id)),
    ] : null;
    if (last) {
      const scopes = await tx.select({ rank: monthlyHeroPositionMeta.rankBracket, mode: monthlyHeroPositionMeta.gameMode,
        position: monthlyHeroPositionMeta.position, samples: sql<number>`sum(${monthlyHeroPositionMeta.matchCount})::double precision` })
        .from(monthlyHeroPositionMeta).where(eq(monthlyHeroPositionMeta.versionId, version.id))
        .groupBy(monthlyHeroPositionMeta.rankBracket, monthlyHeroPositionMeta.gameMode, monthlyHeroPositionMeta.position);
      for (const rank of RANKS) for (const mode of MODES) for (let position = 1; position <= 5; position++) {
        if (!scopes.some(row => row.rank === rank && row.mode === mode.id && row.position === position && row.samples > 0)) throw new Error("Monthly Meta cohort coverage is incomplete");
      }
      const coverage = await tx.select({ position: monthlyPositionPerformance.position, minute: monthlyPositionPerformance.minute,
        rank: monthlyPositionPerformance.rankGroup, samples: monthlyPositionPerformance.sampleCount }).from(monthlyPositionPerformance)
        .where(eq(monthlyPositionPerformance.versionId, version.id));
      for (const rank of RANK_GROUPS) for (let position = 1; position <= 5; position++) for (let minute = 0; minute <= 75; minute++) {
        if (!coverage.some(row => row.rank === rank && row.position === position && row.minute === minute && row.samples > 0)) throw new Error("Monthly Performance position/minute coverage is incomplete");
      }
    }
    if (last && (!counts![0][0]?.total || !counts![1][0]?.total)) throw new Error("Monthly performance coverage is empty");
    await tx.update(monthlyReferenceVersions).set({ performanceCursor: version.performanceCursor + 1, updatedAt: new Date(),
      performanceLastSuccessAt: new Date(), performanceLastError: null, errorMessage: null, ...(last ? { status: "active", completedAt: new Date(),
        heroRows: counts![0][0].total, positionRows: counts![1][0].total } : {}) }).where(eq(monthlyReferenceVersions.id, version.id));
    await tx.insert(monthlyReferenceEvents).values({ versionId: version.id, service: "performance", level: "success",
      message: `${job.rank} / هفتهٔ ${job.week / (7 * 86_400_000)}: ${rows.length} ردیف؛ ${version.performanceCursor + 1} از ${jobs.length}${last ? `؛ ${pruned} Hero+Position با نمونهٔ ناکافی حذف شد؛ نسخه فعال شد` : ""}` });
    if (last) await tx.update(monthlyReferenceVersions).set({ status: "retired", updatedAt: new Date() })
      .where(and(eq(monthlyReferenceVersions.referenceMonth, version.referenceMonth), eq(monthlyReferenceVersions.status, "active"), sql`${monthlyReferenceVersions.id} <> ${version.id}`));
    return { status: last ? "activated" as const : "progress" as const, versionId: version.id, completed: version.performanceCursor + 1, total: jobs.length };
  });
}

export async function listMonthlyReferences() {
  return getDb().select().from(monthlyReferenceVersions).orderBy(desc(monthlyReferenceVersions.referenceMonth), desc(monthlyReferenceVersions.startedAt));
}

export async function getMonthlyReferenceEvents(versionId: string) {
  const [version] = await getDb().select({ id: monthlyReferenceVersions.id }).from(monthlyReferenceVersions)
    .where(eq(monthlyReferenceVersions.id, versionId)).limit(1);
  if (!version) return null;
  return getDb().select().from(monthlyReferenceEvents).where(eq(monthlyReferenceEvents.versionId, versionId))
    .orderBy(desc(monthlyReferenceEvents.createdAt)).limit(60);
}

export async function getMonthlyHeroDetails(versionId: string, heroId: number, minute: number) {
  const [version] = await getDb().select().from(monthlyReferenceVersions)
    .where(eq(monthlyReferenceVersions.id, versionId)).limit(1);
  if (!version) return null;
  const reference = eq(monthlyHeroPositionMeta.referenceMonth, version.referenceMonth);
  const [meta, performance, position] = await Promise.all([
    getDb().select().from(monthlyHeroPositionMeta).where(and(reference,
      eq(monthlyHeroPositionMeta.versionId, versionId), eq(monthlyHeroPositionMeta.heroId, heroId),
      inArray(monthlyHeroPositionMeta.rankBracket, RANKS)))
      .orderBy(monthlyHeroPositionMeta.gameMode, monthlyHeroPositionMeta.rankBracket, monthlyHeroPositionMeta.position),
    getDb().select().from(monthlyHeroPerformance).where(and(eq(monthlyHeroPerformance.referenceMonth, version.referenceMonth),
      eq(monthlyHeroPerformance.versionId, versionId), eq(monthlyHeroPerformance.heroId, heroId), eq(monthlyHeroPerformance.minute, minute),
      eq(monthlyHeroPerformance.rankGroup, "DIVINE_IMMORTAL")))
      .orderBy(monthlyHeroPerformance.rankGroup, monthlyHeroPerformance.position),
    getDb().select().from(monthlyPositionPerformance).where(and(eq(monthlyPositionPerformance.referenceMonth, version.referenceMonth),
      eq(monthlyPositionPerformance.versionId, versionId), eq(monthlyPositionPerformance.minute, minute),
      eq(monthlyPositionPerformance.rankGroup, "DIVINE_IMMORTAL")))
      .orderBy(monthlyPositionPerformance.rankGroup, monthlyPositionPerformance.position),
  ]);
  return { meta, performance, position, version: { id: version.id, referenceMonth: version.referenceMonth, status: version.status } };
}

export async function recordMonthlyFailure(error: unknown) {
  const version = await buildingVersion();
  if (!version) return;
  const message = (error instanceof Error ? error.message : "Unknown monthly reference error").slice(0, 500);
  const service = version.metaCursor < metaTasks.length ? "meta" : "performance";
  await locked(async tx => {
    await tx.update(monthlyReferenceVersions).set({ errorMessage: message, updatedAt: new Date(),
      ...(service === "meta" ? { metaLastError: message, metaLastErrorAt: new Date() }
        : { performanceLastError: message, performanceLastErrorAt: new Date() }) })
      .where(eq(monthlyReferenceVersions.id, version.id));
    await tx.insert(monthlyReferenceEvents).values({ versionId: version.id, service, level: "error", message });
  });
}
