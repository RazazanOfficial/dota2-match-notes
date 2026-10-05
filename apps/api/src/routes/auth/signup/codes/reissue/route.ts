import { z } from "zod";
import type { HttpRequest } from "../../../../../http/protocol";
import { getRequestUser, hasValidRequestOrigin } from "../../../../../lib/auth/request";
import { PasswordAuthError } from "../../../../../lib/auth/password";
import { passwordAuthErrorResponse } from "../../../../../lib/auth/password-response";
import { reissueSignupRecoveryCodes } from "../../../../../lib/auth/recovery";

export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const user = await getRequestUser(request);
    if (!user) throw new PasswordAuthError(401, "unauthorized", "ابتدا وارد حساب شوید");
    const body = z.object({ password: z.string().min(1).max(72) }).strict().parse(await request.json());
    const recoveryCodes = await reissueSignupRecoveryCodes(user.id, body.password);
    return Response.json({ ok: true, recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return passwordAuthErrorResponse(error); }
}
