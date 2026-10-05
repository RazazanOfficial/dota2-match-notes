import { z } from "zod";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { HttpRequest } from "../../../../http/protocol";
import { getDb } from "../../../../lib/db";
import { users } from "../../../../lib/db/schema";
import { hasValidRequestOrigin } from "../../../../lib/auth/request";
import { PasswordAuthError, passwordLoginKey, assertPasswordLoginAllowed, recordPasswordLoginFailure, clearPasswordLoginFailures } from "../../../../lib/auth/password";
import { passwordAuthErrorResponse } from "../../../../lib/auth/password-response";
import { normalizeRecoveryEmail, requireStrongAccountPassword, resetAccountPassword } from "../../../../lib/auth/recovery";
import { normalizePasswordSteamIdentifier } from "../../../../lib/auth/password-validation";

export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const body = z.object({ method: z.enum(["email", "recovery"]), identifier: z.string().max(254), code: z.string().min(6).max(16), password: z.string().max(72), confirmPassword: z.string().max(72) }).strict().parse(await request.json());
    requireStrongAccountPassword(body.password, body.confirmPassword);
    let identifier: string;
    try { identifier = body.method === "email" ? normalizeRecoveryEmail(body.identifier) : normalizePasswordSteamIdentifier(body.identifier); }
    catch { throw new PasswordAuthError(400, "invalid_identifier", "شناسه معتبر نیست"); }
    const key = passwordLoginKey("account-recovery", identifier);
    await assertPasswordLoginAllowed(key);
    const [user] = body.method === "email"
      ? await getDb().select({ id: users.id }).from(users).where(and(sql`lower(${users.recoveryEmail}) = ${identifier}`, isNotNull(users.recoveryEmailVerifiedAt))).limit(1)
      : await getDb().select({ id: users.id }).from(users).where(eq(users.steamId, identifier)).limit(1);
    try {
      if (!user) throw new PasswordAuthError(400, "invalid_recovery_code", "کد معتبر نیست یا منقضی شده است");
      await resetAccountPassword(user.id, body.method, body.code, body.password);
    } catch (error) {
      if (!(error instanceof PasswordAuthError) || error.code !== "invalid_recovery_code") throw error;
      await recordPasswordLoginFailure(key);
      throw new PasswordAuthError(400, "invalid_recovery_code", "کد معتبر نیست یا منقضی شده است");
    }
    await clearPasswordLoginFailures(key);
    return Response.json({ ok: true });
  } catch (error) { return passwordAuthErrorResponse(error); }
}
