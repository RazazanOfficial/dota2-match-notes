import type { HttpRequest } from "../../../http/protocol";
import { getRequestUser } from "../../../lib/auth/request";
import { AdminError, adminErrorResponse } from "../../../lib/admin/errors";
import { getAccountProfile } from "../../../lib/profile/repository";

export async function GET(request: HttpRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) throw new AdminError(401, "unauthorized", "ابتدا وارد حساب شوید");
    // Identity comes only from the authenticated session, never a query ID.
    const profile = await getAccountProfile(user.id);
    if (!profile) throw new AdminError(404, "user_not_found", "کاربر پیدا نشد");
    return Response.json({ ok: true, profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
