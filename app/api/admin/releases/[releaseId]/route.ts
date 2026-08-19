import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { updateRelease } from "@/lib/releases/repository";
import { releaseIdSchema, releaseInputSchema } from "@/lib/releases/validation";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  try {
    await requireSuperAdmin(request);
    const id = releaseIdSchema.parse((await context.params).releaseId);
    const input = releaseInputSchema.parse(await request.json());
    const release = await updateRelease(id, input);
    if (!release) throw new AdminError(404, "release_not_found", "نسخه پیدا نشد");
    return Response.json({ ok: true, release });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
