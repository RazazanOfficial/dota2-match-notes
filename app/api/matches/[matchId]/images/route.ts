import type { NextRequest } from "next/server";
import { MediaError, mediaErrorResponse } from "@/lib/media/errors";
import { getPublicMatchImages } from "@/lib/media/service";
import { parseUuid } from "@/lib/media/validation";
import { getMatchPreparationProgress } from "@/lib/match-preparation/repository";
import { enqueueOpenDotaParseIfNeeded } from "@/lib/opendota-parse/repository";

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

    await enqueueOpenDotaParseIfNeeded(matchId.data);
    const [images, preparation] = await Promise.all([
      getPublicMatchImages(matchId.data),
      getMatchPreparationProgress(matchId.data),
    ]);
    return Response.json({ ok: true, images, preparation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
