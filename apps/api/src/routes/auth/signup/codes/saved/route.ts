import { and, eq, isNull, sql } from "drizzle-orm";
import type { HttpRequest } from "../../../../../http/protocol";
import { getRequestUser, hasValidRequestOrigin } from "../../../../../lib/auth/request";
import { PasswordAuthError } from "../../../../../lib/auth/password";
import { passwordAuthErrorResponse } from "../../../../../lib/auth/password-response";
import { getDb } from "../../../../../lib/db";
import { accountRecoveryCodes, users } from "../../../../../lib/db/schema";

export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const user = await getRequestUser(request);
    if (!user) throw new PasswordAuthError(401, "unauthorized", "ابتدا وارد حساب شوید");
    const completed = await getDb().transaction(async tx => {
      const [current] = await tx.select({ passwordHash: users.passwordHash, completedAt: users.onboardingCompletedAt, savedAt: users.recoveryCodesSavedAt })
        .from(users).where(eq(users.id, user.id)).for("update");
      if (!current?.passwordHash || current.completedAt) throw new PasswordAuthError(409, "registration_incomplete", "وضعیت ثبت‌نام معتبر نیست");
      const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(accountRecoveryCodes)
        .where(and(eq(accountRecoveryCodes.userId, user.id), isNull(accountRecoveryCodes.usedAt)));
      if (!count || count.total !== 6) throw new PasswordAuthError(409, "codes_unavailable", "کدهای بازیابی موجود نیستند");
      if (!current.savedAt) await tx.update(users).set({ recoveryCodesSavedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(users.id, user.id));
      return true;
    });
    return Response.json({ ok: completed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return passwordAuthErrorResponse(error); }
}
