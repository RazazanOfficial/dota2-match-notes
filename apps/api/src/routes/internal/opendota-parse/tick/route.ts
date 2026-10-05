import type { HttpRequest } from "../../../../http/protocol";
import { runOpenDotaParseTick } from "../../../../lib/opendota-parse/service";
import { requireSyncWorkerSecret } from "../../../../lib/sync/auth";
import { syncWorkerErrorResponse } from "../../../../lib/sync/errors";


export async function POST(request: HttpRequest) {
  try {
    requireSyncWorkerSecret(request);
    const tick = await runOpenDotaParseTick();
    return Response.json({ ok: true, tick }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return syncWorkerErrorResponse(error);
  }
}
