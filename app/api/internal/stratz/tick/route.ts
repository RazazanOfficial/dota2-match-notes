import type { NextRequest } from "next/server";
import { requireSyncWorkerSecret } from "@/lib/sync/auth";
import { SyncWorkerError, syncWorkerErrorResponse } from "@/lib/sync/errors";

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

    return Response.json(
      { ok: false, code: "match_stratz_worker_retired" },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return syncWorkerErrorResponse(error);
  }
}
