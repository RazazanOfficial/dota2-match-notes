import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasValidRequestOrigin } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/session-cookie";
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
} from "@/lib/auth/password";
import { passwordLoginSchema } from "@/lib/auth/password-validation";
import { passwordAuthErrorResponse } from "@/lib/auth/password-response";

export const runtime = "nodejs";

function clientAddress(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
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
    if (!user) {
      await recordPasswordLoginFailure(keyHash);
      throw new PasswordAuthError(
        404,
        "account_not_registered",
        "این حساب هنوز در Dota2Notes ثبت نشده است",
      );
    }
    if (!user.passwordHash) {
      throw new PasswordAuthError(
        409,
        "password_not_configured",
        "برای این حساب هنوز رمز عبور تعیین نشده است",
      );
    }
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      await recordPasswordLoginFailure(keyHash);
      throw new PasswordAuthError(401, "incorrect_password", "رمز عبور اشتباه است");
    }
    await clearPasswordLoginFailures(keyHash);
    await markPasswordLoginSuccess(user.id);
    void prunePasswordLoginAttempts().catch(() => undefined);
    const session = await createSession(user.id);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    return passwordAuthErrorResponse(error);
  }
}
