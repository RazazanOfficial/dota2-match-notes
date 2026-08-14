import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { adminErrorResponse } from "@/lib/admin/errors";
import { getAdminOverview } from "@/lib/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const overview = await getAdminOverview();
    return Response.json(
      { ok: true, overview },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
