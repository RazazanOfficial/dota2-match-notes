import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { hasValidRequestOrigin } from "@/lib/auth/request";
import { adminErrorResponse } from "@/lib/admin/errors";
import { createRelease, listAdminReleases } from "@/lib/releases/repository";
import { releaseInputSchema } from "@/lib/releases/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    return Response.json({ ok: true, releases: await listAdminReleases() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSuperAdmin(request);
    if (!hasValidRequestOrigin(request)) return Response.json({ ok: false, error: { code: "invalid_origin", message: "مبدأ درخواست معتبر نیست" } }, { status: 403 });
    const input = releaseInputSchema.parse(await request.json());
    return Response.json({ ok: true, release: await createRelease(user.id, input) }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
