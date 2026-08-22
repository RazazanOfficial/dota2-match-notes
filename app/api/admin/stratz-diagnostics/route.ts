import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminError } from "@/lib/admin/errors";
import { fetchStratzDiagnostics } from "@/lib/stratz/client";
import { getStratzConfig } from "@/lib/stratz/config";
import { buildStratzMatchDiagnostics } from "@/lib/stratz/diagnostics";
import { stratzErrorResponse } from "@/lib/stratz/errors";
import { stratzDiagnosticsQuerySchema } from "@/lib/stratz/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSuperAdmin(request);
    if (process.env.STRATZ_DIAGNOSTICS_ENABLED?.trim() !== "true") {
      throw new AdminError(404, "stratz_diagnostics_disabled", "API آزمایشی STRATZ غیرفعال است");
    }
    getStratzConfig();
    const { matchIds } = stratzDiagnosticsQuerySchema.parse({
      matchIds: request.nextUrl.searchParams.get("matchIds") || "",
    });
    const matches = await fetchStratzDiagnostics(matchIds);
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
