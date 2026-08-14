import type { NextRequest } from "next/server";
import { getRequestUser, hasValidRequestOrigin } from "@/lib/auth/request";
import { OpenDotaError, openDotaErrorResponse } from "@/lib/opendota/errors";
import { syncRecentMatchesFromOpenDota } from "@/lib/opendota/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const sync = await syncRecentMatchesFromOpenDota(user);
    return Response.json(
      { ok: true, sync },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return openDotaErrorResponse(error);
  }
}
