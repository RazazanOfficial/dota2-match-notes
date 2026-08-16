import type { NextRequest } from "next/server";
import { matchImageJobErrorResponse } from "@/lib/match-image-job/errors";
import { runMatchImageJobTick } from "@/lib/match-image-job/service";
import { requireSyncWorkerSecret } from "@/lib/sync/auth";
import { SyncWorkerError } from "@/lib/sync/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

    const tick = await runMatchImageJobTick();
    return Response.json(
      { ok: true, tick },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return matchImageJobErrorResponse(error);
  }
}
