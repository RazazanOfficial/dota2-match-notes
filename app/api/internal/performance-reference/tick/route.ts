import type { NextRequest } from "next/server";
import { requireSyncWorkerSecret } from "@/lib/sync/auth";
import { syncWorkerErrorResponse } from "@/lib/sync/errors";
import { ensureMonthlyReference, recordMonthlyFailure, runMonthlyMetaTick, runMonthlyPerformanceTick } from "@/lib/monthly-reference/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    requireSyncWorkerSecret(request);
    const scheduled = await ensureMonthlyReference();
    const meta = await runMonthlyMetaTick();
    const performance = await runMonthlyPerformanceTick();
    return Response.json({ ok: true, scheduled, meta, performance }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    try { await recordMonthlyFailure(error); } catch (recordError) { console.error("Monthly reference error recording failed", recordError); }
    return syncWorkerErrorResponse(error);
  }
}
