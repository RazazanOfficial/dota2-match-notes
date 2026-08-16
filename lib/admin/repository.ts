import {
  desc,
  eq,
  gt,
  ilike,
  or,
  sql,
} from "drizzle-orm";
import type { SteamProfile } from "@/lib/auth/steam";
import { getDb } from "@/lib/db";
import {
  adminAuditLogs,
  dotaMatches,
  externalApiRateLimits,
  journalMatches,
  matchImageJobs,
  matchImages,
  sessions,
  syncJobs,
  users,
} from "@/lib/db/schema";

const publicUserFields = {
  id: users.id,
  steamId: users.steamId,
  steamAccountId: users.steamAccountId,
  handle: users.handle,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
  profileUrl: users.profileUrl,
  isAdmin: users.isAdmin,
  lastLoginAt: users.lastLoginAt,
  lastManualSyncAt: users.lastManualSyncAt,
  lastScheduledSyncAt: users.lastScheduledSyncAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function userSearchCondition(query: string) {
  if (!query) return undefined;
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  return or(
    ilike(users.handle, pattern),
    ilike(users.displayName, pattern),
    ilike(users.steamId, pattern),
    sql`${users.steamAccountId}::text ilike ${pattern}`,
  );
}

export async function listAdminUsers(params: {
  query: string;
  limit: number;
  offset: number;
}) {
  const db = getDb();
  const condition = userSearchCondition(params.query);
  const [rows, [countRow]] = await Promise.all([
    db
      .select(publicUserFields)
      .from(users)
      .where(condition)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(condition),
  ]);

  return { users: rows, total: countRow?.total || 0 };
}

export async function provisionAdminUser(params: {
  actorUserId: string;
  profile: SteamProfile;
}) {
  const { actorUserId, profile } = params;
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          eq(users.steamId, profile.steamId),
          eq(users.steamAccountId, profile.accountId),
        ),
      )
      .limit(1);

    let user;
    if (existing) {
      [user] = await tx
        .update(users)
        .set({
          steamId: profile.steamId,
          steamAccountId: profile.accountId,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          profileUrl: profile.profileUrl,
          updatedAt: now,
        })
        .where(eq(users.id, existing.id))
        .returning(publicUserFields);
    } else {
      [user] = await tx
        .insert(users)
        .values({
          steamId: profile.steamId,
          steamAccountId: profile.accountId,
          handle: `steam_${profile.accountId}`,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          profileUrl: profile.profileUrl,
        })
        .returning(publicUserFields);
    }

    await tx.insert(adminAuditLogs).values({
      actorUserId,
      targetUserId: user.id,
      action: existing ? "user.profile_refreshed" : "user.provisioned",
      metadata: {
        steamId: profile.steamId,
        steamAccountId: profile.accountId,
      },
    });

    return { user, created: !existing };
  });
}

export async function getAdminOverviewData() {
  const db = getDb();
  const now = new Date();
  const [
    [userCounts],
    [activeSessionCount],
    [journalMatchCount],
    [cachedMatchCount],
    [imageTotals],
    syncJobCounts,
    imageJobCounts,
    rateLimits,
    [auditCount],
    recentAuditLogs,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        loggedIn: sql<number>`count(*) filter (where ${users.lastLoginAt} is not null)::int`,
        databaseAdmins: sql<number>`count(*) filter (where ${users.isAdmin})::int`,
      })
      .from(users),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(sessions)
      .where(gt(sessions.expiresAt, now)),
    db.select({ total: sql<number>`count(*)::int` }).from(journalMatches),
    db.select({ total: sql<number>`count(*)::int` }).from(dotaMatches),
    db
      .select({
        total: sql<number>`count(*)::int`,
        sizeBytes: sql<number>`coalesce(sum(${matchImages.sizeBytes}), 0)::bigint`,
      })
      .from(matchImages),
    db
      .select({
        status: syncJobs.status,
        total: sql<number>`count(*)::int`,
      })
      .from(syncJobs)
      .groupBy(syncJobs.status),
    db
      .select({
        status: matchImageJobs.status,
        total: sql<number>`count(*)::int`,
      })
      .from(matchImageJobs)
      .groupBy(matchImageJobs.status),
    db
      .select()
      .from(externalApiRateLimits)
      .orderBy(externalApiRateLimits.key),
    db.select({ total: sql<number>`count(*)::int` }).from(adminAuditLogs),
    db
      .select({
        id: adminAuditLogs.id,
        actorUserId: adminAuditLogs.actorUserId,
        targetUserId: adminAuditLogs.targetUserId,
        action: adminAuditLogs.action,
        metadata: adminAuditLogs.metadata,
        createdAt: adminAuditLogs.createdAt,
      })
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(20),
  ]);

  const syncJobSummary = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };
  for (const row of syncJobCounts) syncJobSummary[row.status] = row.total;
  const imageJobSummary = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };
  for (const row of imageJobCounts) imageJobSummary[row.status] = row.total;

  return {
    counts: {
      users: userCounts?.total || 0,
      usersWithLogin: userCounts?.loggedIn || 0,
      databaseAdmins: userCounts?.databaseAdmins || 0,
      activeSessions: activeSessionCount?.total || 0,
      journalMatches: journalMatchCount?.total || 0,
      cachedDotaMatches: cachedMatchCount?.total || 0,
      generatedImages: imageTotals?.total || 0,
      generatedImageBytes: Number(imageTotals?.sizeBytes || 0),
      adminAuditLogs: auditCount?.total || 0,
    },
    syncJobs: syncJobSummary,
    imageJobs: imageJobSummary,
    rateLimits,
    recentAuditLogs,
  };
}
