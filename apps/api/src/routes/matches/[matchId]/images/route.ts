import type { HttpRequest } from "../../../../http/protocol";
import { MediaError, mediaErrorResponse } from "../../../../lib/media/errors";
import { getPublicMatchImages } from "../../../../lib/media/service";
import { parseUuid } from "../../../../lib/media/validation";
import { getMatchPreparationProgress } from "../../../../lib/match-preparation/repository";


interface RouteContext {
  params: Promise<{ matchId: string }>;
}

export async function GET(_request: HttpRequest, context: RouteContext) {
  try {
    const matchId = parseUuid((await context.params).matchId);
    if (!matchId.success) {
      throw new MediaError(400, "invalid_match_id", "شناسه مچ نامعتبر است");
    }

    const [images, preparation] = await Promise.all([
      getPublicMatchImages(matchId.data),
      getMatchPreparationProgress(matchId.data),
    ]);
    return Response.json({ ok: true, images, preparation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
