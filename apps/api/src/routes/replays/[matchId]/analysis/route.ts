import { logFailure } from "../../../../http/log";
import type { HttpRequest } from "../../../../http/protocol";
import { z } from "zod";
import { getRequestUser } from "../../../../lib/auth/request";
import { loadStandaloneMatchAnalysis } from "../../../../lib/dota/match-analysis-repository";
import { replayStatusForMatch } from "../../../../lib/replay/job-repository";

interface Context { params: Promise<{ matchId: string }> }
const positionsSchema = z.record(z.string().regex(/^(?:[0-4]|12[89]|13[0-2])$/), z.number().int().min(1).max(5));
export async function GET(request: HttpRequest, context: Context) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { message: "ابتدا وارد حساب شوید" } }, { status: 401 });
  const id = z.coerce.number().int().positive().safe().safeParse((await context.params).matchId);
  if (!id.success) return Response.json({ ok: false, error: { message: "Match ID معتبر نیست" } }, { status: 400 });
  const raw = request.parsedUrl.searchParams.get("positions");
  let positions: Record<string, number> | undefined;
  if (raw) {
    try { positions = positionsSchema.parse(JSON.parse(raw)); }
    catch { return Response.json({ ok: false, error: { message: "Position معتبر نیست" } }, { status: 400 }); }
  }
  try {
    const result = await loadStandaloneMatchAnalysis(id.data, user.steamAccountId, positions);
    if (!result.found) return Response.json({ ok: false, error: { message: "مچ پیدا نشد" } }, { status: 404 });
    if (!result.replayParsed) {
      const state = await replayStatusForMatch(id.data);
      return Response.json({ ok: true, analysis: null, preparation: { replay: state.status, errorCode: state.errorCode, progress: state.progress } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ ok: true, analysis: result.analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { logFailure("Standalone analysis failed", error); return Response.json({ ok: false, error: { message: "تحلیل مچ آماده نشد" } }, { status: 500 }); }
}
