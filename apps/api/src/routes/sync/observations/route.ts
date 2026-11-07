import { z } from "zod";
import type { HttpRequest } from "../../../http/protocol";
import { acceptObservation } from "../../../lib/sync/companion";
import { openDotaErrorResponse } from "../../../lib/opendota/errors";
export async function POST(request: HttpRequest) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!token)
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  const input = z
    .object({
      matchId: z.number().int().min(10_000_000).max(999_999_999_999),
      endedAt: z.union([z.iso.datetime(), z.number().int().positive()]),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json(
      { error: { code: "invalid_observation" } },
      { status: 400 },
    );
  const endedAt = new Date(input.data.endedAt),
    age = Date.now() - endedAt.getTime();
  if (age < -60_000 || age > 30 * 86_400_000)
    return Response.json(
      { error: { code: "invalid_observation_time" } },
      { status: 400 },
    );
  try {
    return Response.json(
      {
        ok: true,
        ...(await acceptObservation(token, input.data.matchId, endedAt)),
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return openDotaErrorResponse(error);
  }
}
