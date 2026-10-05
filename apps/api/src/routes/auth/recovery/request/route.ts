import { z } from "zod";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { HttpRequest } from "../../../../http/protocol";
import { getDb } from "../../../../lib/db";
import { users } from "../../../../lib/db/schema";
import { hasValidRequestOrigin } from "../../../../lib/auth/request";
import { PasswordAuthError, passwordLoginKey, assertPasswordLoginAllowed, recordPasswordLoginFailure } from "../../../../lib/auth/password";
import { passwordAuthErrorResponse } from "../../../../lib/auth/password-response";
import { normalizeRecoveryEmail, startEmailChallenge } from "../../../../lib/auth/recovery";
import { clientAddress } from "../../../../lib/auth/client-address";

export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) throw new PasswordAuthError(503, "email_not_configured", "ارسال ایمیل هنوز روی سرور فعال نشده است");
    const body = z.object({ email: z.string().max(254) }).strict().parse(await request.json());
    const email = normalizeRecoveryEmail(body.email);
    const key = passwordLoginKey(`email-request:${clientAddress(request)}`, email);
    await assertPasswordLoginAllowed(key);
    await recordPasswordLoginFailure(key); // Limit delivery attempts even for unknown addresses.
    const [user] = await getDb().select({ id: users.id }).from(users).where(and(sql`lower(${users.recoveryEmail}) = ${email}`, isNotNull(users.recoveryEmailVerifiedAt))).limit(1);
    if (user) await startEmailChallenge(user.id, email, "reset").catch(() => undefined);
    return Response.json({ ok: true, sent: true }, { status: 202 });
  } catch (error) { return passwordAuthErrorResponse(error); }
}
