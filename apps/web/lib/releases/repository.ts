import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { releaseNoteReads, releaseNotes } from "@/lib/db/schema";
import type { ReleaseInput } from "./validation";

function serializeRelease(release: typeof releaseNotes.$inferSelect) {
  return {
    id: release.id,
    version: release.version,
    title: release.title,
    summary: release.summary,
    content: release.content,
    status: release.status,
    publishedAt: release.publishedAt?.toISOString() || null,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
  };
}

export async function listPublishedReleases(userId?: string | null) {
  const db = getDb();
  const releases = await db
    .select()
    .from(releaseNotes)
    .where(eq(releaseNotes.status, "published"))
    .orderBy(desc(releaseNotes.publishedAt), desc(releaseNotes.createdAt));
  const reads = userId && releases.length
    ? await db.select({ releaseId: releaseNoteReads.releaseId }).from(releaseNoteReads).where(
        and(eq(releaseNoteReads.userId, userId), inArray(releaseNoteReads.releaseId, releases.map((release) => release.id))),
      )
    : [];
  const readIds = new Set(reads.map((read) => read.releaseId));
  return {
    releases: releases.map(serializeRelease),
    latestReleaseId: releases[0]?.id || null,
    hasUnread: Boolean(releases[0] && !readIds.has(releases[0].id)),
  };
}

export async function markReleaseRead(userId: string, releaseId: string) {
  const [release] = await getDb()
    .select({ id: releaseNotes.id })
    .from(releaseNotes)
    .where(and(eq(releaseNotes.id, releaseId), eq(releaseNotes.status, "published")))
    .limit(1);
  if (!release) return false;
  await getDb().insert(releaseNoteReads).values({ userId, releaseId }).onConflictDoUpdate({
    target: [releaseNoteReads.userId, releaseNoteReads.releaseId],
    set: { seenAt: new Date() },
  });
  return true;
}

export async function listAdminReleases() {
  const releases = await getDb().select().from(releaseNotes).orderBy(desc(releaseNotes.createdAt));
  return releases.map(serializeRelease);
}

export async function createRelease(authorUserId: string, input: ReleaseInput) {
  const now = new Date();
  const [release] = await getDb().insert(releaseNotes).values({
    ...input,
    authorUserId,
    publishedAt: input.status === "published" ? now : null,
    updatedAt: now,
  }).returning();
  return serializeRelease(release);
}

export async function updateRelease(releaseId: string, input: ReleaseInput) {
  const db = getDb();
  const [current] = await db.select().from(releaseNotes).where(eq(releaseNotes.id, releaseId)).limit(1);
  if (!current) return null;
  const now = new Date();
  const [release] = await db.update(releaseNotes).set({
    ...input,
    publishedAt: input.status === "published" ? current.publishedAt || now : null,
    updatedAt: now,
  }).where(eq(releaseNotes.id, releaseId)).returning();
  return serializeRelease(release);
}

