import type { HttpRequest } from "../../../../http/protocol";
import { z } from "zod";
import { requireSuperAdmin } from "../../../../lib/admin/auth";
import { AdminError, adminErrorResponse } from "../../../../lib/admin/errors";
import { getAccountProfile } from "../../../../lib/profile/repository";

export async function GET(request: HttpRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    await requireSuperAdmin(request);
    const userId = z.uuid().parse((await context.params).userId);
    const profile = await getAccountProfile(userId);
    if (!profile) throw new AdminError(404, "user_not_found", "کاربر پیدا نشد");
    return Response.json({ ok: true, profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
