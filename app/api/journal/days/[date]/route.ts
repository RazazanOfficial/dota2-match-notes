import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/auth/request";
import { jsonError, journalErrorResponse } from "@/lib/journal/http";
import { saveJournalDay } from "@/lib/journal/repository";
import { dayInputSchema, parseDateKey } from "@/lib/journal/validation";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ date: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonError(401, "unauthorized", "ابتدا وارد حساب شوید");

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 512_000) {
      return jsonError(413, "payload_too_large", "حجم اطلاعات روز بیش از حد مجاز است");
    }

    const dateResult = parseDateKey((await context.params).date);
    if (!dateResult.success) return jsonError(400, "invalid_date", "تاریخ نامعتبر است");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "invalid_json", "بدنه درخواست JSON معتبر نیست");
    }

    const day = dayInputSchema.parse(body);
    const profile = await saveJournalDay(user.id, dateResult.data, day);

    return Response.json({ ok: true, profile });
  } catch (error) {
    return journalErrorResponse(error);
  }
}
