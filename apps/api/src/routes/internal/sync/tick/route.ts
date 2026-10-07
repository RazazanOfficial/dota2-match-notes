import type { HttpRequest } from "../../../../http/protocol";
import { requireSyncWorkerSecret } from "../../../../lib/sync/auth";
import { SyncWorkerError, syncWorkerErrorResponse } from "../../../../lib/sync/errors";
import { runScheduledSyncTick } from "../../../../lib/sync/service";


export async function POST(request: HttpRequest) {
  try {
    requireSyncWorkerSecret(request);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1_024) {
      throw new SyncWorkerError(
        413,
        "payload_too_large",
        "حجم درخواست بیش از حد مجاز است",
      );
    }

    const tick = await runScheduledSyncTick();
    return Response.json(
      { ok: true, tick },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return syncWorkerErrorResponse(error);
  }
}
