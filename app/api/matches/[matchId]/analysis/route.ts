import { z } from "zod";
import { loadPublicMatchAnalysis } from "@/lib/dota/match-analysis-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface RouteContext { params: Promise<{ matchId: string }> }
export async function GET(_request: Request, context: RouteContext) {
  const parsedId = z.string().uuid().safeParse((await context.params).matchId);
  if (!parsedId.success) return Response.json({ ok: false, error: { code: "invalid_match_id", message: "شناسه مچ معتبر نیست" } }, { status: 400 });
  try {
    const result = await loadPublicMatchAnalysis(parsedId.data);
    if (!result.found) return Response.json({ ok: false, error: { code: "match_not_found", message: "مچ پیدا نشد" } }, { status: 404 });
    return Response.json({ ok: true, analysis: result.analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to build match analysis", { matchId: parsedId.data, error });
    return Response.json({ ok: false, error: { code: "analysis_failed", message: "تحلیل این مچ آماده نشد" } }, { status: 500 });
  }
}
