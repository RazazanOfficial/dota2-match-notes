import type { HttpRequest } from "../../../http/protocol";
import { requireSuperAdmin } from "../../../lib/admin/auth";
import { adminErrorResponse } from "../../../lib/admin/errors";
import { getServiceMonitor } from "../../../lib/admin/service-monitor";


export async function GET(request: HttpRequest) {
  try {
    await requireSuperAdmin(request);
    return Response.json({ ok: true, monitor: await getServiceMonitor() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) { return adminErrorResponse(error); }
}
