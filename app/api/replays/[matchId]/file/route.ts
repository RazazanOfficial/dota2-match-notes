import type { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { z } from "zod";
import { getRequestUser } from "@/lib/auth/request";
import { replayObjectStream, REPLAY_MAX_BYTES } from "@/lib/replay/archive-storage";
import { getReplayArchive } from "@/lib/replay/job-repository";
import { isStorageNotFound } from "@/lib/storage/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Context { params: Promise<{ matchId: string }> }
export async function GET(request: NextRequest, context: Context) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { message: "ابتدا وارد حساب شوید" } }, { status: 401 });
  const id = z.coerce.number().int().positive().safe().safeParse((await context.params).matchId);
  if (!id.success) return Response.json({ ok: false, error: { message: "Match ID معتبر نیست" } }, { status: 400 });
  try {
    const archived = await getReplayArchive(id.data);
    if (!archived) return Response.json({ ok: false, error: { message: "فایل در پارس‌پک پیدا نشد؛ درخواست دانلود را دوباره بزنید" } }, { status: 404 });
    const result = await replayObjectStream(archived.key);
    if (!result.Body || result.ContentLength !== archived.bytes || archived.bytes > REPLAY_MAX_BYTES) {
      (result.Body as Readable | undefined)?.destroy?.();
      throw new Error("Archived replay length changed during download");
    }
    const stream = result.Body as Readable;
    return new Response(Readable.toWeb(stream) as ReadableStream, { headers: {
      "Content-Type": "application/octet-stream", "Content-Length": String(archived.bytes),
      "Content-Disposition": `attachment; filename="${id.data}.dem.bz2"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (isStorageNotFound(error)) return Response.json({ ok: false, error: { message: "فایل در پارس‌پک پیدا نشد؛ درخواست دانلود را دوباره بزنید" } }, { status: 404 });
    console.error("Replay file failed", { matchId: id.data, error });
    return Response.json({ ok: false, error: { message: "دریافت فایل ممکن نیست" } }, { status: 503 });
  }
}
