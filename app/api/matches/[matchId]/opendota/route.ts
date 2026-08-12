import type { NextRequest } from "next/server";
import {
  getRequestUser,
  hasValidRequestOrigin,
} from "@/lib/auth/request";
import { OpenDotaError, openDotaErrorResponse } from "@/lib/opendota/errors";
import { syncJournalMatchFromOpenDota } from "@/lib/opendota/service";
import {
  openDotaSyncInputSchema,
  parseJournalMatchId,
} from "@/lib/opendota/validation";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ matchId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!hasValidRequestOrigin(request)) {
      throw new OpenDotaError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    }
    const user = await getRequestUser(request);
    if (!user) {
      throw new OpenDotaError(401, "unauthorized", "ابتدا وارد حساب شوید");
    }

    const journalMatchId = parseJournalMatchId((await context.params).matchId);
    if (!journalMatchId.success) {
      throw new OpenDotaError(
        400,
        "invalid_match_id",
        "شناسه مچ دفتر نامعتبر است",
      );
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4_096) {
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
    const input = openDotaSyncInputSchema.parse(rawBody);
    const match = await syncJournalMatchFromOpenDota(
      user,
      journalMatchId.data,
      input.dotaMatchId,
    );
    return Response.json({ ok: true, match });
  } catch (error) {
    return openDotaErrorResponse(error);
  }
}
