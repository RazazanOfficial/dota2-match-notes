import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/auth/request";
import { listPublishedReleases } from "@/lib/releases/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  return Response.json({ ok: true, ...(await listPublishedReleases(user?.id)) }, { headers: { "Cache-Control": "no-store" } });
}

