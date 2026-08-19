import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/auth/request";
import { jsonError } from "@/lib/journal/http";
import { markReleaseRead } from "@/lib/releases/repository";
import { releaseIdSchema } from "@/lib/releases/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return jsonError(401, "unauthorized", "ابتدا وارد حساب شوید");
  const parsed = releaseIdSchema.safeParse((await context.params).releaseId);
  if (!parsed.success) return jsonError(400, "invalid_release", "شناسه نسخه معتبر نیست");
  if (!(await markReleaseRead(user.id, parsed.data))) return jsonError(404, "release_not_found", "نسخه پیدا نشد");
  return Response.json({ ok: true });
}

