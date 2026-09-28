import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { adminErrorResponse, AdminError } from "@/lib/admin/errors";
import { hasValidRequestOrigin } from "@/lib/auth/request";
import { ensureMonthlyReference, getMonthlyHeroDetails, getMonthlyReferenceEvents, listMonthlyReferences } from "@/lib/monthly-reference/service";
import { performanceJobs } from "@/lib/monthly-reference/model";
import { HEROES } from "@/data/heroes";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const params = request.nextUrl.searchParams;
    if (params.get("view") === "events") {
      const input = z.object({ view: z.literal("events"), versionId: z.uuid() }).strict().parse(Object.fromEntries(params));
      const events = await getMonthlyReferenceEvents(input.versionId);
      if (!events) throw new AdminError(404, "reference_not_found", "نسخهٔ مرجع پیدا نشد");
      return Response.json({ ok: true, events }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (params.get("view") === "hero") {
      const input = z.object({ view: z.literal("hero"), versionId: z.uuid(), heroId: z.coerce.number().int().positive(),
        minute: z.coerce.number().int().min(0).max(75) }).strict().parse(Object.fromEntries(params));
      if (!HEROES.some(hero => hero.id === input.heroId)) throw new AdminError(400, "invalid_hero", "Hero معتبر نیست");
      const details = await getMonthlyHeroDetails(input.versionId, input.heroId, input.minute);
      if (!details) throw new AdminError(404, "reference_not_found", "نسخهٔ مرجع پیدا نشد");
      return Response.json({ ok: true, details }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (params.size) throw new AdminError(400, "invalid_request", "درخواست معتبر نیست");
    const versions = (await listMonthlyReferences()).map(version => ({
      ...version,
      performanceTotal: performanceJobs(new Date(`${version.referenceMonth}T00:00:00Z`)).length,
    }));
    return Response.json({ ok: true, versions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    if (!hasValidRequestOrigin(request)) throw new AdminError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    const input = z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional() }).strict().parse(await request.json());
    const result = await ensureMonthlyReference(new Date(), true, input.month);
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
