import type { HttpRequest } from "../../../../http/protocol";
import { HttpResponse } from "../../../../http/protocol";
import { hasValidRequestOrigin } from "../../../../lib/auth/request";
import { createSession } from "../../../../lib/auth/session";
import { setSessionCookie } from "../../../../lib/auth/session-cookie";
import {
  assertPasswordLoginAllowed,
  clearPasswordLoginFailures,
  findPasswordUser,
  markPasswordLoginSuccess,
  passwordLoginKey,
  PasswordAuthError,
  prunePasswordLoginAttempts,
  recordPasswordLoginFailure,
  verifyPassword,
} from "../../../../lib/auth/password";
import { passwordLoginSchema } from "../../../../lib/auth/password-validation";
import { passwordAuthErrorResponse } from "../../../../lib/auth/password-response";
import { clientAddress } from "../../../../lib/auth/client-address";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../../../../lib/auth/password";

let dummyHash: Promise<string> | undefined;
function getDummyHash() { return dummyHash ??= hashPassword(randomBytes(32).toString("hex")); }


export async function POST(request: HttpRequest) {
  try {
    if (!hasValidRequestOrigin(request)) {
      throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4_096) {
      throw new PasswordAuthError(413, "payload_too_large", "حجم درخواست بیش از حد مجاز است");
    }
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new PasswordAuthError(400, "invalid_json", "اطلاعات ورود معتبر نیست");
    }
    const body = passwordLoginSchema.parse(payload);
    const keyHash = passwordLoginKey(clientAddress(request), body.steamIdentifier);
    await assertPasswordLoginAllowed(keyHash);
    const user = await findPasswordUser(body.steamIdentifier);
    const valid = await verifyPassword(body.password, user?.passwordHash || await getDummyHash());
    if (!user?.passwordHash || !valid) {
      await recordPasswordLoginFailure(keyHash);
      throw new PasswordAuthError(401, "invalid_credentials", "اطلاعات ورود معتبر نیست");
    }
    await clearPasswordLoginFailures(keyHash);
    await markPasswordLoginSuccess(user.id);
    void prunePasswordLoginAttempts().catch(() => undefined);
    const session = await createSession(user.id);
    const bearer = request.parsedUrl.searchParams.get("session") === "bearer";
    const response = HttpResponse.json(bearer
      ? { ok: true, token: session.token, expiresAt: session.expiresAt.toISOString() }
      : { ok: true });
    if (!bearer) setSessionCookie(response, session);
    return response;
  } catch (error) {
    return passwordAuthErrorResponse(error);
  }
}
