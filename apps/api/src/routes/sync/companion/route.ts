import { z } from "zod";
import type { HttpRequest } from "../../../http/protocol";
import {
  getRequestUser,
  hasValidRequestOrigin,
} from "../../../lib/auth/request";
import { registerCompanion } from "../../../lib/sync/companion";
export async function POST(request: HttpRequest) {
  if (!hasValidRequestOrigin(request))
    return Response.json(
      { error: { code: "invalid_origin" } },
      { status: 403 },
    );
  const user = await getRequestUser(request);
  if (!user)
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  const input = z
    .object({ deviceId: z.string().uuid().optional() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json(
      { error: { code: "invalid_device" } },
      { status: 400 },
    );
  return Response.json(
    {
      ok: true,
      ...(await registerCompanion(user.id, input.data.deviceId)),
      steamId: user.steamId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: HttpRequest) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!token)
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  const { getDb } = await import("../../../lib/db"),
    { sql } = await import("drizzle-orm"),
    { companionHash } = await import("../../../lib/sync/companion");
  await getDb().execute(
    sql`UPDATE companion_devices SET revoked_at=now() WHERE token_hash=${companionHash(token)}`,
  );
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
