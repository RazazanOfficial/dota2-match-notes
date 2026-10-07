import type { HttpRequest } from "../../../http/protocol";
import { requireSuperAdmin } from "../../../lib/admin/auth";
import { adminErrorResponse } from "../../../lib/admin/errors";
import { getAdminOverview } from "../../../lib/admin/service";
import { overviewQuerySchema } from "../../../lib/admin/validation";


export async function GET(request: HttpRequest) {
  try {
    await requireSuperAdmin(request);
    const query = overviewQuerySchema.parse({
      range: request.parsedUrl.searchParams.get("range") || undefined,
    });
    const overview = await getAdminOverview(query.range);
    return Response.json(
      { ok: true, overview },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
