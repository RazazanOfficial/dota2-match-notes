import { logFailure } from "../../../../http/log";
import type { HttpRequest } from "../../../../http/protocol";
import { requireSyncWorkerSecret } from "../../../../lib/sync/auth";
import { SyncWorkerError, syncWorkerErrorResponse } from "../../../../lib/sync/errors";
import { MonthlyReferencePartitionsError } from "../../../../lib/monthly-reference/partitions";
import { ensureMonthlyReference, recordMonthlyFailure, runMonthlyMetaTick, runMonthlyPerformanceTick } from "../../../../lib/monthly-reference/service";


export async function POST(request: HttpRequest) {
  let authorized = false;
  try {
    requireSyncWorkerSecret(request);
    authorized = true;
    const scheduled = await ensureMonthlyReference();
    const meta = await runMonthlyMetaTick();
    const performance = await runMonthlyPerformanceTick();
    return Response.json({ ok: true, scheduled, meta, performance }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MonthlyReferencePartitionsError) {
      return syncWorkerErrorResponse(new SyncWorkerError(error.status, error.code, error.message));
    }
    if (authorized) {
      try { await recordMonthlyFailure(error); } catch { logFailure("Monthly reference error recording failed"); }
    }
    return syncWorkerErrorResponse(error);
  }
}
