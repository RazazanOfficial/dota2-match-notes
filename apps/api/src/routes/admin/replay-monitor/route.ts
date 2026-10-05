import type { HttpRequest } from "../../../http/protocol";
import { z } from "zod";
import { requireSuperAdmin } from "../../../lib/admin/auth";
import { adminErrorResponse } from "../../../lib/admin/errors";
import { getReplayMonitor } from "../../../lib/admin/replay-monitor";
export async function GET(request: HttpRequest) {
  try {
    await requireSuperAdmin(request);
    const raw = request.parsedUrl.searchParams.get("matchId");
    const id = raw === null ? undefined : z.coerce.number().int().positive().safe().parse(raw);
    return Response.json({ ok: true, monitor: await getReplayMonitor(id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
