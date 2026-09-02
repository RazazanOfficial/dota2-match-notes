import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  heroBenchmarkDistributions,
  heroPositionMeta,
  performanceReferenceSnapshots,
} from "@/lib/db/schema";
import { fetchAllHeroBenchmarks, fetchAllHeroPositionMeta } from "./providers";

const REFRESH_INTERVAL_MS = 72 * 60 * 60 * 1_000;
const ADVISORY_LOCK_ID = 2_741_072;

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function lockAcquired(result: unknown) {
  const rows = (result as { rows?: Array<{ locked?: boolean }> }).rows;
  return rows?.[0]?.locked === true;
}

export async function runPerformanceReferenceTick(options: { force?: boolean } = {}) {
  return getDb().transaction(async (tx) => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) as locked`);
    if (!lockAcquired(lock)) return { status: "busy" as const };

    const [active] = await tx.select().from(performanceReferenceSnapshots)
      .where(eq(performanceReferenceSnapshots.status, "active"))
      .orderBy(desc(performanceReferenceSnapshots.activatedAt)).limit(1);
    if (!options.force && active?.fetchedAt && Date.now() - active.fetchedAt.getTime() < REFRESH_INTERVAL_MS) {
      return { status: "fresh" as const, snapshotId: active.id, fetchedAt: active.fetchedAt.toISOString() };
    }

    const [building] = await tx.insert(performanceReferenceSnapshots).values({
      status: "building",
      windowDays: 7,
      sourceSummary: "stratz-week+opendota-benchmarks",
    }).returning({ id: performanceReferenceSnapshots.id });

    // Fetches happen before activation. Any error rolls this transaction back,
    // so the last known-good active snapshot always remains readable.
    const [meta, benchmarks] = await Promise.all([
      fetchAllHeroPositionMeta(),
      fetchAllHeroBenchmarks(),
    ]);
    if (meta.length < 500) throw new Error(`STRATZ reference coverage is too small (${meta.length})`);
    if (benchmarks.length < 300) throw new Error(`OpenDota benchmark coverage is too small (${benchmarks.length})`);

    for (const batch of chunks(meta, 500)) {
      await tx.insert(heroPositionMeta).values(batch.map((row) => ({ snapshotId: building.id, ...row })));
    }
    for (const batch of chunks(benchmarks, 300)) {
      await tx.insert(heroBenchmarkDistributions).values(batch.map((row) => ({
        snapshotId: building.id,
        heroId: row.heroId,
        position: 0,
        rankBracket: "ALL",
        gameMode: 0,
        patch: "",
        metric: row.metric,
        provider: "opendota",
        sampleCount: null,
        quantiles: row.quantiles,
      })));
    }

    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + REFRESH_INTERVAL_MS);
    await tx.update(performanceReferenceSnapshots).set({ status: "retired", updatedAt: fetchedAt })
      .where(eq(performanceReferenceSnapshots.status, "active"));
    await tx.update(performanceReferenceSnapshots).set({
      status: "active",
      fetchedAt,
      activatedAt: fetchedAt,
      expiresAt,
      updatedAt: fetchedAt,
    }).where(eq(performanceReferenceSnapshots.id, building.id));
    return {
      status: "updated" as const,
      snapshotId: building.id,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metaRows: meta.length,
      benchmarkRows: benchmarks.length,
    };
  });
}
