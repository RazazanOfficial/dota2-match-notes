import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { reprocessRecentUserMatches } from "@/lib/admin/reprocess-matches";
import { reprocessMatchesSchema } from "@/lib/admin/validation";
import { hasValidRequestOrigin } from "@/lib/auth/request";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ userId: string }> };
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!hasValidRequestOrigin(request)) throw new AdminError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const actor = await requireSuperAdmin(request);
    const targetUserId = z.string().uuid().parse((await context.params).userId);
    let payload: unknown;
    try { payload = await request.json(); } catch { throw new AdminError(400, "invalid_json", "اطلاعات درخواست معتبر نیست"); }
    const input = reprocessMatchesSchema.parse(payload);
    const result = await reprocessRecentUserMatches({ actorUserId: actor.id, targetUserId, count: input.count });
    return Response.json({ ok: true, result });
  } catch (error) { return adminErrorResponse(error); }
}
