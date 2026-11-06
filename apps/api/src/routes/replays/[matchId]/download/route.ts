import type { HttpRequest } from "../../../../http/protocol";
import { z } from "zod";
import { getRequestUser } from "../../../../lib/auth/request";
import { getReplayArchive } from "../../../../lib/replay/job-repository";
import { createReplayDownloadTicket } from "../../../../lib/replay/download-ticket";
export async function GET(request: HttpRequest, context: { params: Promise<{ matchId: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
  const id = z.coerce.number().int().positive().safe().safeParse((await context.params).matchId);
  if (!id.success) return Response.json({ ok: false, error: { code: "invalid_match_id" } }, { status: 400 });
  try {
    // Preserve the existing authenticated standalone-match download policy.
    const archive = await getReplayArchive(id.data);
    if (!archive) return Response.json({ ok: false, error: { code: "replay_archive_pending" } }, { status: 409, headers: { "Retry-After": "5", "Cache-Control": "private, no-store" } });
    return Response.json({ ok: true, download: await createReplayDownloadTicket(id.data, archive) }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    // SDK errors can contain a signed URL; never log raw errors here.
    return Response.json({ ok: false, error: { code: "replay_archive_unavailable" } }, { status: 503 });
  }
}
