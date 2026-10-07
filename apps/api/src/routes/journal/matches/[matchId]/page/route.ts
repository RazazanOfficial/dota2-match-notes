import type { HttpRequest } from "../../../../../http/protocol";
import { getRequestUser } from "../../../../../lib/auth/request";
import { parsePublicPlayerIdentifier } from "../../../../../lib/journal/validation";
import { findJournalOwnerByIdentifier, loadJournalMatchPage } from "../../../../../lib/journal/repository";
import { z } from "zod";
export async function GET(request: HttpRequest, context: { params: Promise<{ matchId: string }> }) {
  const matchId = z.union([z.uuid(), z.string().regex(/^\d{1,16}$/).refine(value => Number.isSafeInteger(Number(value)) && Number(value) > 0)]).safeParse((await context.params).matchId);
  if (!matchId.success) return Response.json({ ok: false, error: { code: "invalid_match_id" } }, { status: 400 });
  const session = await getRequestUser(request);
  let ownerId = session?.id;
  const rawPlayer = request.parsedUrl.searchParams.get("player");
  if (rawPlayer) {
    const identifier = parsePublicPlayerIdentifier(rawPlayer);
    if (!identifier) return Response.json({ ok: false, error: { code: "invalid_identifier" } }, { status: 400 });
    const owner = await findJournalOwnerByIdentifier(identifier);
    if (!owner) return Response.json({ ok: false, error: { code: "player_not_found" } }, { status: 404 });
    ownerId = owner.id;
  }
  const page = await loadJournalMatchPage(matchId.data, ownerId);
  if (!page) return Response.json({ ok: false, error: { code: "match_not_found" } }, { status: 404 });
  return Response.json({ ok: true, page, readonly: session?.id !== page.owner.id });
}
