import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { journalMatches, users } from "../db/schema";
import { isSuperAdminSteamId } from "../admin/config";

// Explicit projection: credentials, recovery codes and session tokens never
// belong in either the user's profile or the admin's account inspector.
export async function getAccountProfile(userId: string) {
  const db = getDb();
  const [user] = await db.select({
    id: users.id, handle: users.handle, displayName: users.displayName,
    steamId: users.steamId, steamAccountId: users.steamAccountId,
    avatarUrl: users.avatarUrl, isAdmin: users.isAdmin, createdAt: users.createdAt,
    lastLoginAt: users.lastLoginAt, lastManualSyncAt: users.lastManualSyncAt,
    lastScheduledSyncAt: users.lastScheduledSyncAt,
    onboardingCompletedAt: users.onboardingCompletedAt,
    hasPassword: sql<boolean>`${users.passwordHash} is not null`,
    hasVerifiedEmail: sql<boolean>`${users.recoveryEmailVerifiedAt} is not null`,
    hasSavedRecoveryCodes: sql<boolean>`${users.recoveryCodesSavedAt} is not null`,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [[stats], recent] = await Promise.all([
    db.select({
      total: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${journalMatches.result} = 'win')::int`,
      losses: sql<number>`count(*) filter (where ${journalMatches.result} = 'loss')::int`,
      analyzed: sql<number>`count(*) filter (where ${journalMatches.analysisSummary}->>'ready' = 'true')::int`,
    }).from(journalMatches).where(eq(journalMatches.userId, userId)),
    db.select({ matchId: journalMatches.dotaMatchId, heroId: journalMatches.heroId,
      heroName: journalMatches.heroName, result: journalMatches.result,
      startedAt: journalMatches.startedAt, duration: journalMatches.durationSeconds,
    }).from(journalMatches).where(eq(journalMatches.userId, userId))
      .orderBy(desc(journalMatches.startedAt), desc(journalMatches.id)).limit(10),
  ]);
  const isSuperAdmin = isSuperAdminSteamId(user.steamId);
  return { user: { ...user, isAdmin: user.isAdmin || isSuperAdmin, isSuperAdmin },
    stats: { ...stats, winRate: stats.total ? stats.wins / stats.total * 100 : 0 }, recent };
}
