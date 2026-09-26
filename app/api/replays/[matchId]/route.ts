import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getRequestUser, hasValidRequestOrigin } from "@/lib/auth/request";
import { getDb } from "@/lib/db";
import { dotaMatches } from "@/lib/db/schema";
import { replayStatusForMatch, requestReplayByDotaId } from "@/lib/replay/job-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Context { params: Promise<{ matchId: string }> }
const idSchema = z.coerce.number().int().positive().safe();

export async function GET(request: NextRequest, context: Context) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { message: "ابتدا وارد حساب شوید" } }, { status: 401 });
  const id = idSchema.safeParse((await context.params).matchId);
  if (!id.success) return Response.json({ ok: false, error: { message: "Match ID معتبر نیست" } }, { status: 400 });
  const [match] = await getDb().select({ matchId: dotaMatches.matchId }).from(dotaMatches).where(eq(dotaMatches.matchId, id.data)).limit(1);
  if (!match) return Response.json({ ok: false, error: { message: "مچ پیدا نشد" } }, { status: 404 });
  try { return Response.json({ ok: true, ...await replayStatusForMatch(id.data) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { console.error("Replay status failed", error); return Response.json({ ok: false, error: { message: "وضعیت Replay در دسترس نیست" } }, { status: 503 }); }
}

export async function POST(request: NextRequest, context: Context) {
  if (!hasValidRequestOrigin(request)) return Response.json({ ok: false, error: { message: "مبدأ درخواست معتبر نیست" } }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { message: "ابتدا وارد حساب شوید" } }, { status: 401 });
  const id = idSchema.safeParse((await context.params).matchId);
  const input = z.object({ intent: z.enum(["download", "analysis"]) }).safeParse(await request.json().catch(() => null));
  if (!id.success || !input.success) return Response.json({ ok: false, error: { message: "درخواست معتبر نیست" } }, { status: 400 });
  try {
    const status = await requestReplayByDotaId(id.data, input.data.intent);
    if (status === "not_found") return Response.json({ ok: false, error: { message: "ابتدا Match ID را جست‌وجو کنید" } }, { status: 404 });
    if (status === "expired") return Response.json({ ok: false, error: { message: "Replay در پارس‌پک موجود نیست و از مهلت دریافت آن گذشته است" } }, { status: 409 });
    return Response.json({ ok: true, status }, { status: status === "ready" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { console.error("Replay request failed", error); return Response.json({ ok: false, error: { message: "درخواست Replay انجام نشد" } }, { status: 503 }); }
}
