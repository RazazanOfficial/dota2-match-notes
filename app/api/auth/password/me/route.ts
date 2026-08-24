import type { NextRequest } from "next/server";
import { getRequestUser, hasValidRequestOrigin } from "@/lib/auth/request";
import { PasswordAuthError, removeUserPassword, setUserPassword } from "@/lib/auth/password";
import { passwordChangeSchema } from "@/lib/auth/password-validation";
import { passwordAuthErrorResponse } from "@/lib/auth/password-response";

export const runtime = "nodejs";

async function requireUser(request: NextRequest) {
  if (!hasValidRequestOrigin(request)) {
    throw new PasswordAuthError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
  }
  const user = await getRequestUser(request);
  if (!user) throw new PasswordAuthError(401, "unauthorized", "ابتدا وارد حساب شوید");
  return user;
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new PasswordAuthError(400, "invalid_json", "اطلاعات رمز عبور معتبر نیست");
    }
    const body = passwordChangeSchema.parse(payload);
    await setUserPassword(user.id, body.password);
    return Response.json({ ok: true, hasPassword: true });
  } catch (error) {
    return passwordAuthErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await removeUserPassword(user.id);
    return Response.json({ ok: true, hasPassword: false });
  } catch (error) {
    return passwordAuthErrorResponse(error);
  }
}
