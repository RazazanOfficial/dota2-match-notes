import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/auth/request";
import { jsonError, journalErrorResponse } from "@/lib/journal/http";
import { loadActiveHeroPool, saveHeroPool } from "@/lib/hero-pool/repository";
import { heroPoolInputSchema } from "@/lib/hero-pool/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonError(401, "unauthorized", "ابتدا وارد حساب شوید");
    return Response.json({ ok: true, heroPool: await loadActiveHeroPool(user.id) });
  } catch (error) {
    return journalErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonError(401, "unauthorized", "ابتدا وارد حساب شوید");
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 32_000) return jsonError(413, "payload_too_large", "حجم Hero Pool بیش از حد مجاز است");
    const input = heroPoolInputSchema.parse(await request.json());
    return Response.json({ ok: true, heroPool: await saveHeroPool(user.id, input) });
  } catch (error) {
    return journalErrorResponse(error);
  }
}
