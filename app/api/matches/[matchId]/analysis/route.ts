import type { NextRequest } from "next/server";
import { z } from "zod";
import { loadPublicMatchAnalysis } from "@/lib/dota/match-analysis-repository";
import { getOpenDotaAnalysisState, requestOpenDotaAnalysis } from "@/lib/opendota-parse/repository";
import { getRequestUser, hasValidRequestOrigin } from "@/lib/auth/request";
import { ANALYSIS_TOKEN_COST } from "@/lib/opendota/analysis-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface RouteContext { params: Promise<{ matchId: string }> }
const positionOverridesSchema=z.record(z.string().regex(/^(?:[0-4]|12[89]|13[0-2])$/),z.number().int().min(1).max(5));
export async function GET(request: NextRequest, context: RouteContext) {
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
      const state = await getOpenDotaAnalysisState(parsedId.data);
      return Response.json({ ok: true, analysis: null, preparation: { replay: state?.status || "basic", errorCode: state?.errorCode || null, tokenCost: ANALYSIS_TOKEN_COST } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ ok: true, analysis: result.analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to build match analysis", { matchId: parsedId.data, error });
    return Response.json({ ok: false, error: { code: "analysis_failed", message: "تحلیل این مچ آماده نشد" } }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsedId = z.string().uuid().safeParse((await context.params).matchId);
  if (!parsedId.success) return Response.json({ ok: false, error: { code: "invalid_match_id", message: "شناسه مچ معتبر نیست" } }, { status: 400 });
  if (!hasValidRequestOrigin(request)) return Response.json({ ok: false, error: { code: "invalid_origin", message: "مبدأ درخواست معتبر نیست" } }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { code: "unauthorized", message: "ابتدا وارد حساب شوید" } }, { status: 401 });
  try {
    const state = await requestOpenDotaAnalysis(parsedId.data, user.id);
    if (state === "not_found") return Response.json({ ok: false, error: { code: "match_not_found", message: "مچ در دفتر شما پیدا نشد" } }, { status: 404 });
    if (state === "expired") return Response.json({ ok: false, error: { code: "replay_too_old", message: "از این مچ بیش از ۲۰ روز گذشته و درخواست جدید Replay برای آن ارسال نمی‌شود" } }, { status: 409 });
    return Response.json({ ok: true, preparation: { replay: state === "already_queued" ? "pending" : state, tokenCost: state === "queued" ? ANALYSIS_TOKEN_COST : 0 } }, { status: state === "ready" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to request match analysis", { matchId: parsedId.data, error });
    return Response.json({ ok: false, error: { code: "analysis_request_failed", message: "درخواست تحلیل این مچ ثبت نشد" } }, { status: 500 });
  }
}
