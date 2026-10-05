import type { HttpRequest } from "../../http/protocol";
import { getRequestUser } from "../../lib/auth/request";
import { listPublishedReleases } from "../../lib/releases/repository";


export async function GET(request: HttpRequest) {
  const user = await getRequestUser(request);
  return Response.json({ ok: true, ...(await listPublishedReleases(user?.id)) }, { headers: { "Cache-Control": "no-store" } });
}

