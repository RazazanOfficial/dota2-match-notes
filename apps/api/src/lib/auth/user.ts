import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { SteamProfile } from "./steam";
import { toJournalDateKey } from "../journal/timezone";

export async function upsertSteamUser(profile: SteamProfile) {
  const now = new Date();
  const [existing] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.steamId, profile.steamId))
    .limit(1);

  if (existing) {
    const [updated] = await getDb()
      .update(users)
      .set({
        steamAccountId: profile.accountId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        profileUrl: profile.profileUrl,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, existing.id))
      .returning();

    return updated;
  }

  return getDb().transaction(async (tx) => {
    const [created] = await tx.insert(users).values({
      steamId: profile.steamId,
      steamAccountId: profile.accountId,
      handle: `steam_${profile.accountId}`,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      lastLoginAt: now,
    }).returning();

    // Start discovery as soon as the verified Steam identity is durable. This
    // job is independent of the remaining signup steps and manual cooldowns.
    const cutoff = new Date(now.getTime() - 3 * 86_400_000);
    await tx.execute(sql`INSERT INTO sync_jobs
      (user_id, kind, status, manual_request, manual_attempted)
      VALUES (${created.id}::uuid, 'manual', 'pending',
        ${JSON.stringify({ scope: "week", from: toJournalDateKey(cutoff), to: toJournalDateKey(now), mode: "basic", source: "signup", cutoff: cutoff.toISOString() })}::jsonb,
        '[]'::jsonb) ON CONFLICT DO NOTHING`);
    return created;
  });
}
