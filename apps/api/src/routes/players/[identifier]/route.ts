import { parsePublicPlayerIdentifier } from "../../../lib/journal/validation";
import { findJournalOwnerByIdentifier } from "../../../lib/journal/repository";
import type { HttpRequest } from "../../../http/protocol";
export async function GET(_request: HttpRequest, context: { params: Promise<{ identifier: string }> }) {
  const identifier = parsePublicPlayerIdentifier((await context.params).identifier);
  if (!identifier) return Response.json({ ok: false, error: { code: "invalid_identifier" } }, { status: 400 });
  const player = await findJournalOwnerByIdentifier(identifier);
  if (!player) return Response.json({ ok: false, error: { code: "player_not_found" } }, { status: 404 });
  return Response.json({ ok: true, player });
}
