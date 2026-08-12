import type { NextRequest } from "next/server";
import { MediaError, mediaErrorResponse } from "@/lib/media/errors";
import { getPublicMatchImages } from "@/lib/media/service";
import { parseUuid } from "@/lib/media/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ matchId: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const matchId = parseUuid((await context.params).matchId);
    if (!matchId.success) {
      throw new MediaError(400, "invalid_match_id", "شناسه مچ نامعتبر است");
    }

    const images = await getPublicMatchImages(matchId.data);
    return Response.json({ ok: true, images });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
