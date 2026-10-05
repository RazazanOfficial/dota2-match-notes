import type { HttpRequest } from "../../../http/protocol";
import { requireSuperAdmin } from "../../../lib/admin/auth";
import { AdminError } from "../../../lib/admin/errors";
import { fetchStratzMatches } from "../../../lib/stratz/gateway";
import { getStratzConfig } from "../../../lib/stratz/config";
import { buildStratzMatchDiagnostics } from "../../../lib/stratz/diagnostics";
import { stratzErrorResponse } from "../../../lib/stratz/errors";
import { stratzDiagnosticsQuerySchema } from "../../../lib/stratz/validation";


export async function GET(request: HttpRequest) {
  try {
    const user = await requireSuperAdmin(request);
    if (process.env.STRATZ_DIAGNOSTICS_ENABLED?.trim() !== "true") {
      throw new AdminError(404, "stratz_diagnostics_disabled", "API آزمایشی STRATZ غیرفعال است");
    }
    getStratzConfig();
    const { matchIds } = stratzDiagnosticsQuerySchema.parse({
      matchIds: request.parsedUrl.searchParams.get("matchIds") || "",
    });
    const matches = await fetchStratzMatches(matchIds);
    return Response.json(
      {
        ok: true,
        provider: "stratz",
        accountId: String(user.steamAccountId),
        matches: matches.map(({ matchId, match }) =>
          buildStratzMatchDiagnostics(matchId, match, user.steamAccountId),
        ),
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    if (error instanceof AdminError) {
      return Response.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return stratzErrorResponse(error);
  }
}
