import type { NextRequest } from "next/server";
import {
  getRequestUser,
  hasValidRequestOrigin,
} from "@/lib/auth/request";
import { MediaError, mediaErrorResponse } from "@/lib/media/errors";
import { prepareMatchImageUpload } from "@/lib/media/service";
import { parseUuid } from "@/lib/media/validation";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ matchId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!hasValidRequestOrigin(request)) {
      throw new MediaError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    }
    const user = await getRequestUser(request);
    if (!user) throw new MediaError(401, "unauthorized", "ابتدا وارد حساب شوید");

    const matchId = parseUuid((await context.params).matchId);
    if (!matchId.success) {
      throw new MediaError(400, "invalid_match_id", "شناسه مچ نامعتبر است");
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 16_384) {
      throw new MediaError(413, "payload_too_large", "حجم درخواست بیش از حد مجاز است");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new MediaError(400, "invalid_json", "بدنه درخواست JSON معتبر نیست");
    }

    const upload = await prepareMatchImageUpload(user, matchId.data, body);
    return Response.json({ ok: true, upload });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
