import type { HttpRequest } from "../../../../http/protocol";
import { jsonError, journalErrorResponse } from "../../../../lib/journal/http";
import {
  findJournalOwnerByIdentifier,
  loadJournalProfile,
} from "../../../../lib/journal/repository";
import {
  parseDateRange,
  parsePublicPlayerIdentifier,
} from "../../../../lib/journal/validation";


interface RouteContext {
  params: Promise<{ handle: string }>;
}

export async function GET(request: HttpRequest, context: RouteContext) {
  try {
    const identifier = parsePublicPlayerIdentifier((await context.params).handle);
    if (!identifier) {
      return jsonError(400, "invalid_identifier", "شناسه بازیکن نامعتبر است");
    }

    const range = parseDateRange(request.parsedUrl.searchParams);
    if (!range.success) return jsonError(400, "invalid_date_range", range.error);

    const owner = await findJournalOwnerByIdentifier(identifier);
    if (!owner) return jsonError(404, "user_not_found", "کاربر پیدا نشد");

    const profile = await loadJournalProfile(owner, range.data);
    return Response.json({ ok: true, profile });
  } catch (error) {
    return journalErrorResponse(error);
  }
}
