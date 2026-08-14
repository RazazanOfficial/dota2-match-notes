import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { getAdminUsers, provisionUserFromSteam } from "@/lib/admin/service";
import {
  listUsersQuerySchema,
  provisionUserInputSchema,
} from "@/lib/admin/validation";
import { hasValidRequestOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const query = listUsersQuerySchema.parse({
      query: request.nextUrl.searchParams.get("query") || undefined,
      limit: request.nextUrl.searchParams.get("limit") || undefined,
      offset: request.nextUrl.searchParams.get("offset") || undefined,
    });
    const result = await getAdminUsers(query);
    return Response.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidRequestOrigin(request)) {
      throw new AdminError(403, "invalid_origin", "مبدأ درخواست معتبر نیست");
    }
    const actor = await requireSuperAdmin(request);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4_096) {
      throw new AdminError(
        413,
        "payload_too_large",
        "حجم درخواست بیش از حد مجاز است",
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminError(400, "invalid_json", "بدنه درخواست JSON معتبر نیست");
    }
    const input = provisionUserInputSchema.parse(body);
    const result = await provisionUserFromSteam(actor, input.steamId);
    return Response.json(
      { ok: true, ...result },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
