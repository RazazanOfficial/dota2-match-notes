import type { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestUser, hasValidRequestOrigin } from "@/lib/auth/request";
import { requestReplayJob } from "@/lib/replay/job-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface RouteContext { params: Promise<{ matchId: string }> }

// The future download button may call this endpoint. It archives the replay
// without invoking the parser and does not disclose private storage credentials.
export async function POST(request: NextRequest, context: RouteContext) {
  const id = z.string().uuid().safeParse((await context.params).matchId);
  if (!id.success) return Response.json({ ok: false, error: { code: "invalid_match_id", message: "شناسه مچ معتبر نیست" } }, { status: 400 });
  if (!hasValidRequestOrigin(request)) return Response.json({ ok: false, error: { code: "invalid_origin", message: "مبدأ درخواست معتبر نیست" } }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { code: "unauthorized", message: "ابتدا وارد حساب شوید" } }, { status: 401 });
  try {
    const state = await requestReplayJob(id.data, user.id, "download");
    if (state === "not_found") return Response.json({ ok: false, error: { code: "match_not_found", message: "مچ در دفتر شما پیدا نشد" } }, { status: 404 });
    if (state === "expired") return Response.json({ ok: false, error: { code: "replay_too_old", message: "Replay این مچ احتمالاً دیگر در دسترس نیست" } }, { status: 409 });
    return Response.json({ ok: true, status: state }, { status: state === "ready" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to request replay archive", { matchId: id.data, error });
    return Response.json({ ok: false, error: { code: "replay_request_failed", message: "درخواست Replay ثبت نشد" } }, { status: 500 });
  }
}
