import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { SESSION_DURATION_SECONDS } from "./config";

export interface SessionUser {
  id: string;
  steamId: string;
  steamAccountId: number;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  isAdmin: boolean;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1_000);

  await getDb().insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;

  const [row] = await getDb()
    .select({
      id: users.id,
      steamId: users.steamId,
      steamAccountId: users.steamAccountId,
      handle: users.handle,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      profileUrl: users.profileUrl,
      isAdmin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return (row || null) satisfies SessionUser | null;
}

export async function deleteSession(token: string | undefined) {
  if (!token) return;

  await getDb()
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)));
}
