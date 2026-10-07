import { and, asc, desc, eq, sql } from "drizzle-orm";
import { heroById } from "@/data/heroes";
import { getDb } from "@/lib/db";
import { heroPoolEntries, heroPoolVersions } from "@/lib/db/schema";
import { HERO_POOL_ROLES } from "./rules";
import type { HeroPoolInput } from "./validation";

export async function loadActiveHeroPool(userId: string) {
  const db = getDb();
  const [version] = await db
    .select()
    .from(heroPoolVersions)
    .where(and(eq(heroPoolVersions.userId, userId), eq(heroPoolVersions.isActive, true)))
    .limit(1);

  if (!version) return { version: null, pools: Object.fromEntries(HERO_POOL_ROLES.map((role) => [role, []])) };

  const entries = await db
    .select()
    .from(heroPoolEntries)
    .where(eq(heroPoolEntries.poolVersionId, version.id))
    .orderBy(asc(heroPoolEntries.role), asc(heroPoolEntries.sortOrder));

  return {
    version: { id: version.id, number: version.version, createdAt: version.createdAt.toISOString() },
    pools: Object.fromEntries(
      HERO_POOL_ROLES.map((role) => [
        role,
        entries.filter((entry) => entry.role === role).map((entry) => heroById(entry.heroId)).filter(Boolean),
      ]),
    ),
  };
}

export async function saveHeroPool(userId: string, input: HeroPoolInput) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`hero-pool:${userId}`}, 0))`);
    const [current] = await tx
      .select({ id: heroPoolVersions.id, version: heroPoolVersions.version })
      .from(heroPoolVersions)
      .where(and(eq(heroPoolVersions.userId, userId), eq(heroPoolVersions.isActive, true)))
      .orderBy(desc(heroPoolVersions.version))
      .limit(1);

    if (current) {
      await tx.update(heroPoolVersions).set({ isActive: false }).where(eq(heroPoolVersions.id, current.id));
    }

    const [next] = await tx
      .insert(heroPoolVersions)
      .values({ userId, version: (current?.version || 0) + 1 })
      .returning({ id: heroPoolVersions.id });

    await tx.insert(heroPoolEntries).values(
      HERO_POOL_ROLES.flatMap((role) =>
        input[role].map((heroId, sortOrder) => ({
          poolVersionId: next.id,
          role,
          heroId,
          heroName: heroById(heroId)?.name || String(heroId),
          sortOrder,
        })),
      ),
    );
  });

  return loadActiveHeroPool(userId);
}

