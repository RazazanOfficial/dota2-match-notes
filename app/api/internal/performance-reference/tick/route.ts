import type { NextRequest } from "next/server";
import { requireSyncWorkerSecret } from "@/lib/sync/auth";
import { syncWorkerErrorResponse } from "@/lib/sync/errors";
import { runPerformanceReferenceTick } from "@/lib/performance-reference/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    requireSyncWorkerSecret(request);
    const force = new URL(request.url).searchParams.get("force") === "true";
    const tick = await runPerformanceReferenceTick({ force });
    return Response.json({ ok: true, tick }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return syncWorkerErrorResponse(error);
  }
}
