import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { adminErrorResponse } from "@/lib/admin/errors";
import { getServiceMonitor } from "@/lib/admin/service-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    return Response.json({ ok: true, monitor: await getServiceMonitor() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) { return adminErrorResponse(error); }
}
