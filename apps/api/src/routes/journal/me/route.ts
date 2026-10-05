import type { HttpRequest } from "../../../http/protocol";
import { getRequestUser } from "../../../lib/auth/request";
import { jsonError, journalErrorResponse } from "../../../lib/journal/http";
import {
  findJournalOwnerById,
  loadJournalProfile,
} from "../../../lib/journal/repository";
import { parseDateRange } from "../../../lib/journal/validation";


export async function GET(request: HttpRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonError(401, "unauthorized", "ابتدا وارد حساب شوید");

    const range = parseDateRange(request.parsedUrl.searchParams);
    if (!range.success) return jsonError(400, "invalid_date_range", range.error);

    const owner = await findJournalOwnerById(user.id);
    if (!owner) return jsonError(404, "user_not_found", "کاربر پیدا نشد");

    const profile = await loadJournalProfile(owner, range.data);
    return Response.json({ ok: true, profile });
  } catch (error) {
    return journalErrorResponse(error);
  }
}
