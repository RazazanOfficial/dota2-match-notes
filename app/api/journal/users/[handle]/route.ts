import type { NextRequest } from "next/server";
import { jsonError, journalErrorResponse } from "@/lib/journal/http";
import {
  findJournalOwnerByHandle,
  loadJournalProfile,
} from "@/lib/journal/repository";
import { parseDateRange, parseHandle } from "@/lib/journal/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ handle: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const handle = parseHandle((await context.params).handle);
    if (!handle) return jsonError(400, "invalid_handle", "شناسه عمومی نامعتبر است");

    const range = parseDateRange(request.nextUrl.searchParams);
    if (!range.success) return jsonError(400, "invalid_date_range", range.error);

    const owner = await findJournalOwnerByHandle(handle);
    if (!owner) return jsonError(404, "user_not_found", "کاربر پیدا نشد");

    const profile = await loadJournalProfile(owner, range.data);
    return Response.json({ ok: true, profile });
  } catch (error) {
    return journalErrorResponse(error);
  }
}
