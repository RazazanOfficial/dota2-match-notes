import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { adminErrorResponse } from "@/lib/admin/errors";
import { getReplayMonitor } from "@/lib/admin/replay-monitor";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const raw = request.nextUrl.searchParams.get("matchId");
    const id = raw === null ? undefined : z.coerce.number().int().positive().safe().parse(raw);
    return Response.json({ ok: true, monitor: await getReplayMonitor(id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
