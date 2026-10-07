import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { HttpRequest } from "../../../../http/protocol";
import { getRequestUser, hasValidRequestOrigin } from "../../../../lib/auth/request";
import { getDb } from "../../../../lib/db";
import { users } from "../../../../lib/db/schema";
import { PasswordAuthError } from "../../../../lib/auth/password";
import { passwordAuthErrorResponse } from "../../../../lib/auth/password-response";

/** Completes registration only; the gift preview does not grant a subscription. */
export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const user = await getRequestUser(request);
    if (!user) throw new PasswordAuthError(401, "unauthorized", "ابتدا با استیم وارد شوید");
    if (!user.passwordHash || !user.steamId || !user.recoveryCodesSavedAt) throw new PasswordAuthError(409, "registration_incomplete", "ابتدا رمز عبور و ذخیرهٔ کدهای بازیابی را کامل کنید");
    const db = getDb();
    const [updated] = await db.update(users).set({ onboardingCompletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(users.id, user.id), isNull(users.onboardingCompletedAt), isNotNull(users.passwordHash), isNotNull(users.recoveryCodesSavedAt)))
      .returning({ completedAt: users.onboardingCompletedAt });
    const [result] = updated ? [updated] : await db.select({ completedAt: users.onboardingCompletedAt }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!result?.completedAt) throw new PasswordAuthError(409, "registration_incomplete", "ابتدا رمز عبور را ثبت کنید");
    return Response.json({ ok: true, completedAt: result.completedAt, alreadyCompleted: !updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return passwordAuthErrorResponse(error); }
}
