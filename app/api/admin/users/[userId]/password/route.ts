import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { setAdminManagedPassword } from "@/lib/admin/password";
import { hasValidRequestOrigin } from "@/lib/auth/request";
import { passwordChangeSchema } from "@/lib/auth/password-validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

async function contextUsers(request: NextRequest, context: RouteContext) {
  if (!hasValidRequestOrigin(request)) {
    throw new AdminError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
  }
  const actor = await requireSuperAdmin(request);
  const { userId } = await context.params;
  const targetUserId = z.string().uuid().parse(userId);
  return { actor, targetUserId };
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { actor, targetUserId } = await contextUsers(request, context);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new AdminError(400, "invalid_json", "اطلاعات رمز عبور معتبر نیست");
    }
    const body = passwordChangeSchema.parse(payload);
    const result = await setAdminManagedPassword({
      actorUserId: actor.id,
      targetUserId,
      password: body.password,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { actor, targetUserId } = await contextUsers(request, context);
    const result = await setAdminManagedPassword({
      actorUserId: actor.id,
      targetUserId,
      password: null,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
