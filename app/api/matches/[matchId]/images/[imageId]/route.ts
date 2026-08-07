import type { NextRequest } from "next/server";
import {
  getRequestUser,
  hasValidRequestOrigin,
} from "@/lib/auth/request";
import { MediaError, mediaErrorResponse } from "@/lib/media/errors";
import { removeMatchImage } from "@/lib/media/service";
import { parseUuid } from "@/lib/media/validation";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ matchId: string; imageId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    if (!hasValidRequestOrigin(request)) {
      throw new MediaError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    }
    const user = await getRequestUser(request);
    if (!user) throw new MediaError(401, "unauthorized", "ابتدا وارد حساب شوید");

    const params = await context.params;
    const matchId = parseUuid(params.matchId);
    const imageId = parseUuid(params.imageId);
    if (!matchId.success || !imageId.success) {
      throw new MediaError(400, "invalid_id", "شناسه مچ یا تصویر نامعتبر است");
    }

    await removeMatchImage(user, matchId.data, imageId.data);
    return Response.json({ ok: true });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
