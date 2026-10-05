import { createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { passwordLoginAttempts, sessions, users } from "@/lib/db/schema";

const PASSWORD_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1_000;
const ATTEMPT_WINDOW_MS = 30 * 60 * 1_000;

export class PasswordAuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "PasswordAuthError";
  }
}

export function passwordLoginKey(ipAddress: string, steamId: string) {
  return createHash("sha256")
    .update(`${ipAddress.trim() || "unknown"}:${steamId}`)
    .digest("hex");
}

export async function hashPassword(password: string) {
  return hash(password, PASSWORD_COST);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function findPasswordUser(steamId: string) {
  const [user] = await getDb()
    .select({
      id: users.id,
      steamId: users.steamId,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.steamId, steamId))
    .limit(1);
  return user || null;
}

export async function assertPasswordLoginAllowed(keyHash: string) {
  const [attempt] = await getDb()
    .select()
    .from(passwordLoginAttempts)
    .where(eq(passwordLoginAttempts.keyHash, keyHash))
    .limit(1);
  if (!attempt?.lockedUntil || attempt.lockedUntil.getTime() <= Date.now()) return;
  throw new PasswordAuthError(
    429,
    "password_login_locked",
    "تعداد تلاش‌ها بیش از حد مجاز بود؛ کمی بعد دوباره تلاش کنید",
    Math.max(1, Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 1_000)),
  );
}

export async function recordPasswordLoginFailure(keyHash: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`password-login:${keyHash}`}, 0))`,
    );
    const [current] = await tx
      .select()
      .from(passwordLoginAttempts)
      .where(eq(passwordLoginAttempts.keyHash, keyHash))
      .limit(1);
    const failedAttempts =
      !current || current.updatedAt < staleBefore
        ? 1
        : current.failedAttempts + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : null;
    await tx
      .insert(passwordLoginAttempts)
      .values({ keyHash, failedAttempts, lockedUntil, updatedAt: now })
      .onConflictDoUpdate({
        target: passwordLoginAttempts.keyHash,
        set: { failedAttempts, lockedUntil, updatedAt: now },
      });
  });
}

export async function clearPasswordLoginFailures(keyHash: string) {
  await getDb()
    .delete(passwordLoginAttempts)
    .where(eq(passwordLoginAttempts.keyHash, keyHash));
}

export async function markPasswordLoginSuccess(userId: string) {
  const now = new Date();
  await getDb()
    .update(users)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(users.id, userId));
}

export async function setUserPassword(userId: string, password: string) {
  const now = new Date();
  const passwordHash = await hashPassword(password);
  const [user] = await getDb()
    .update(users)
    .set({ passwordHash, passwordUpdatedAt: now, updatedAt: now })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return Boolean(user);
}

export async function removeUserPassword(userId: string) {
  const now = new Date();
  const [user] = await getDb()
    .update(users)
    .set({ passwordHash: null, passwordUpdatedAt: now, updatedAt: now })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return Boolean(user);
}

export async function revokeUserSessions(userId: string) {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function prunePasswordLoginAttempts() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  await getDb()
    .delete(passwordLoginAttempts)
    .where(
      and(
        lt(passwordLoginAttempts.updatedAt, cutoff),
        or(
          isNull(passwordLoginAttempts.lockedUntil),
          lt(passwordLoginAttempts.lockedUntil, new Date()),
        ),
      ),
    );
}
