import { z } from "zod";
import type { HttpRequest } from "../../../../http/protocol";
import { getRequestUser, hasValidRequestOrigin } from "../../../../lib/auth/request";
import { PasswordAuthError } from "../../../../lib/auth/password";
import { passwordAuthErrorResponse } from "../../../../lib/auth/password-response";
import { verifyAccountEmail } from "../../../../lib/auth/recovery";

export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const user = await getRequestUser(request);
    if (!user) throw new PasswordAuthError(401, "unauthorized", "ابتدا وارد حساب شوید");
    const body = z.object({ code: z.string().regex(/^\d{6}$/) }).strict().parse(await request.json());
    if (!await verifyAccountEmail(user.id, body.code)) throw new PasswordAuthError(400, "invalid_email_code", "کد معتبر نیست یا منقضی شده است");
    return Response.json({ ok: true, verified: true });
  } catch (error) { return passwordAuthErrorResponse(error); }
}
