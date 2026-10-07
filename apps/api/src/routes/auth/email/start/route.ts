import { z } from "zod";
import type { HttpRequest } from "../../../../http/protocol";
import { getRequestUser, hasValidRequestOrigin } from "../../../../lib/auth/request";
import { PasswordAuthError } from "../../../../lib/auth/password";
import { passwordAuthErrorResponse } from "../../../../lib/auth/password-response";
import { normalizeRecoveryEmail, startEmailChallenge } from "../../../../lib/auth/recovery";

export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const user = await getRequestUser(request);
    if (!user) throw new PasswordAuthError(401, "unauthorized", "ابتدا وارد حساب شوید");
    if (!user.passwordHash) throw new PasswordAuthError(409, "password_required", "ابتدا رمز حساب را بسازید");
    const body = z.object({ email: z.string().max(254) }).strict().parse(await request.json());
    const email = normalizeRecoveryEmail(body.email);
    await startEmailChallenge(user.id, email, "verify");
    return Response.json({ ok: true, sent: true });
  } catch (error) { return passwordAuthErrorResponse(error); }
}
