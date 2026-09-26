import type { NextRequest } from "next/server";
import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { hasValidRequestOrigin } from "@/lib/auth/request";
import { getDb } from "@/lib/db";
import { adminAuditLogs, localReplayJobs } from "@/lib/db/schema";
import { deleteReplayObject, listReplayFolder, listReplayObjects, REPLAY_ROOT, validReplayFolder, validReplayKey } from "@/lib/replay/archive-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const prefix = request.nextUrl.searchParams.get("prefix") || REPLAY_ROOT;
    if (!validReplayFolder(prefix)) throw new AdminError(400, "invalid_prefix", "مسیر پوشه معتبر نیست");
    const token = request.nextUrl.searchParams.get("token") || undefined;
    if (token && token.length > 2048) throw new AdminError(400, "invalid_token", "صفحه معتبر نیست");
    return Response.json({ ok: true, prefix, ...await listReplayFolder(prefix, token) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSuperAdmin(request);
    if (!hasValidRequestOrigin(request)) throw new AdminError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const input = z.object({ key: z.string().optional(), prefix: z.string().optional() }).strict().parse(await request.json());
    if (Boolean(input.key) === Boolean(input.prefix)) throw new AdminError(400, "invalid_target", "فایل یا پوشه را انتخاب کنید");
    if (input.key && !validReplayKey(input.key) || input.prefix && !validReplayFolder(input.prefix)) {
      throw new AdminError(400, "invalid_target", "مسیر آرشیو معتبر نیست");
    }
    const db = getDb();
    let deleted = 0;
    const remove = async (key: string) => {
      const [job] = await db.select({ matchId: localReplayJobs.matchId, status: localReplayJobs.status })
        .from(localReplayJobs).where(eq(localReplayJobs.archiveKey, key)).limit(1);
      if (job?.status === "processing") throw new AdminError(409, "replay_busy", "این Replay اکنون در حال پردازش است؛ بعداً دوباره حذف کنید");
      await deleteReplayObject(key);
      await db.update(localReplayJobs).set({ archiveStatus: "deleted", updatedAt: new Date() })
        .where(eq(localReplayJobs.archiveKey, key));
      deleted++;
    };
    if (input.key) await remove(input.key);
    else if (input.prefix) {
      const [busyJob] = await db.select({ matchId: localReplayJobs.matchId }).from(localReplayJobs)
        .where(and(like(localReplayJobs.archiveKey, `${input.prefix}%`), eq(localReplayJobs.status, "processing"))).limit(1);
      if (busyJob) throw new AdminError(409, "replay_busy", "یکی از Replayهای پوشه در حال پردازش است؛ بعداً دوباره حذف کنید");
      // Always read the first page: continuation cursors can skip objects after deletion.
      for (;;) {
        const page = await listReplayObjects(input.prefix);
        const keys = (page.Contents || []).flatMap((item) => item.Key ? [item.Key] : []);
        if (!keys.length) break;
        for (let index = 0; index < keys.length; index += 8) {
          const results = await Promise.allSettled(keys.slice(index, index + 8).map(remove));
          const failed = results.find((result) => result.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
        }
      }
      await db.update(localReplayJobs).set({ archiveStatus: "deleted", updatedAt: new Date() })
        .where(like(localReplayJobs.archiveKey, `${input.prefix}%`));
    }
    await db.insert(adminAuditLogs).values({ actorUserId: admin.id, action: "replay.archive_deleted", metadata: { key: input.key || null, prefix: input.prefix || null, deleted } });
    return Response.json({ ok: true, deleted }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
