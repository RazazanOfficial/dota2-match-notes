import { z } from "zod";
import { loadPublicMatchAnalysis } from "@/lib/dota/match-analysis-repository";
import { enqueueOpenDotaParseIfNeeded } from "@/lib/opendota-parse/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface RouteContext { params: Promise<{ matchId: string }> }
const positionOverridesSchema=z.record(z.string().regex(/^(?:[0-4]|12[89]|13[0-2])$/),z.number().int().min(1).max(5));
export async function GET(request: Request, context: RouteContext) {
  const parsedId = z.string().uuid().safeParse((await context.params).matchId);
  if (!parsedId.success) return Response.json({ ok: false, error: { code: "invalid_match_id", message: "شناسه مچ معتبر نیست" } }, { status: 400 });
  try {
    const rawPositions=new URL(request.url).searchParams.get("positions");
    let positionOverrides:Record<string,number>|undefined;
    if(rawPositions){
      let decoded:unknown;
      try{decoded=JSON.parse(rawPositions);}catch{return Response.json({ok:false,error:{code:"invalid_positions",message:"Positionهای انتخاب‌شده معتبر نیستند"}},{status:400});}
      const parsedPositions=positionOverridesSchema.safeParse(decoded);
      if(!parsedPositions.success)return Response.json({ok:false,error:{code:"invalid_positions",message:"Positionهای انتخاب‌شده معتبر نیستند"}},{status:400});
      positionOverrides=parsedPositions.data;
    }
    const result = await loadPublicMatchAnalysis(parsedId.data,positionOverrides);
    if (!result.found) return Response.json({ ok: false, error: { code: "match_not_found", message: "مچ پیدا نشد" } }, { status: 404 });
    if (!result.replayParsed) {
      const parseState = await enqueueOpenDotaParseIfNeeded(parsedId.data);
      if (parseState === "failed") return Response.json({ ok: false, error: { code: "opendota_parse_failed", message: "آماده‌سازی Replay این مچ کامل نشد؛ وضعیت Worker را بررسی کنید" } }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      return Response.json({ ok: true, analysis: null, preparation: { replay: "queued" } }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ ok: true, analysis: result.analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to build match analysis", { matchId: parsedId.data, error });
    return Response.json({ ok: false, error: { code: "analysis_failed", message: "تحلیل این مچ آماده نشد" } }, { status: 500 });
  }
}
