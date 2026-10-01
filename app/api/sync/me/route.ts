import type { NextRequest } from "next/server";
import { getRequestUser, hasValidRequestOrigin } from "@/lib/auth/request";
import { OpenDotaError, openDotaErrorResponse } from "@/lib/opendota/errors";
import { getOpenDotaConfig } from "@/lib/opendota/config";
import { manualMatchSyncInputSchema } from "@/lib/opendota/sync-request";
import { enqueueManualRangeSync, latestManualRangeJob } from "@/lib/sync/manual-service";
import {
  getPlayerSyncSnapshot,
  serializePlayerSyncSnapshot,
} from "@/lib/player-dashboard/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      throw new OpenDotaError(401, "unauthorized", "ابتدا وارد حساب شوید");
    }
    const snapshot = await getPlayerSyncSnapshot(user.id);
    if (!snapshot) {
      throw new OpenDotaError(404, "user_not_found", "حساب کاربر پیدا نشد");
    }
    const config = getOpenDotaConfig();
    const status = serializePlayerSyncSnapshot(snapshot, config.manualSyncCooldownSeconds, config.manualDayCooldownSeconds);
    return Response.json(
      { ok: true, status: { ...status, manualJob: await latestManualRangeJob(user.id) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return openDotaErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidRequestOrigin(request)) {
      throw new OpenDotaError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    }
    const user = await getRequestUser(request);
    if (!user) {
      throw new OpenDotaError(401, "unauthorized", "ابتدا وارد حساب شوید");
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1_024) {
      throw new OpenDotaError(
        413,
        "payload_too_large",
        "حجم درخواست بیش از حد مجاز است",
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new OpenDotaError(400, "invalid_json", "بدنه درخواست JSON معتبر نیست");
    }
    const parsed = manualMatchSyncInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new OpenDotaError(
        400,
        "invalid_sync_range",
        parsed.error.issues[0]?.message || "بازه دریافت مچ معتبر نیست",
      );
    }

    const jobId = await enqueueManualRangeSync(user.id, parsed.data);
    return Response.json(
      { ok: true, jobId },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return openDotaErrorResponse(error);
  }
}
