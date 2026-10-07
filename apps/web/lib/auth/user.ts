import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { SteamProfile } from "./steam";

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

  const [created] = await getDb()
    .insert(users)
    .values({
      steamId: profile.steamId,
      steamAccountId: profile.accountId,
      handle: `steam_${profile.accountId}`,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      lastLoginAt: now,
    })
    .returning();

  return created;
}
