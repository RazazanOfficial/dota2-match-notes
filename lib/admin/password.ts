import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { adminAuditLogs, sessions, users } from "@/lib/db/schema";
import { AdminError } from "./errors";

export async function setAdminManagedPassword(params: {
  actorUserId: string;
  targetUserId: string;
  password: string | null;
}) {
  const passwordHash = params.password ? await hashPassword(params.password) : null;
  const now = new Date();
  await getDb().transaction(async (tx) => {
    const [target] = await tx
      .update(users)
      .set({ passwordHash, passwordUpdatedAt: now, updatedAt: now })
      .where(eq(users.id, params.targetUserId))
      .returning({ id: users.id });
    if (!target) throw new AdminError(404, "user_not_found", "کاربر پیدا نشد");
    await tx.delete(sessions).where(eq(sessions.userId, params.targetUserId));
    await tx.insert(adminAuditLogs).values({
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId,
      action: passwordHash ? "user.password_set" : "user.password_removed",
      metadata: { sessionsRevoked: true },
    });
  });
  return { hasPassword: Boolean(passwordHash) };
}
