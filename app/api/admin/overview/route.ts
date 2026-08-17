import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { adminErrorResponse } from "@/lib/admin/errors";
import { getAdminOverview } from "@/lib/admin/service";
import { overviewQuerySchema } from "@/lib/admin/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const query = overviewQuerySchema.parse({
      range: request.nextUrl.searchParams.get("range") || undefined,
    });
    const overview = await getAdminOverview(query.range);
    return Response.json(
      { ok: true, overview },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
