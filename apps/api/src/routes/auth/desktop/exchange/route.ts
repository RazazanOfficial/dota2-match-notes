import type { HttpRequest } from "../../../../http/protocol";
import { consumeDesktopAuthCode } from "../../../../lib/auth/desktop";
import { createSession } from "../../../../lib/auth/session";
import { hasValidRequestOrigin } from "../../../../lib/auth/request";

export async function POST(request: HttpRequest) {
  if (!hasValidRequestOrigin(request)) {
    return Response.json({ ok: false, error: { code: "invalid_origin" } }, { status: 403 });
  }
  const input = await request.json().catch(() => null) as { code?: unknown; verifier?: unknown } | null;
  if (typeof input?.code !== "string" || typeof input?.verifier !== "string") {
    return Response.json({ ok: false, error: { code: "invalid_grant" } }, { status: 400 });
  }
  const userId = await consumeDesktopAuthCode(input.code, input.verifier);
  if (!userId) return Response.json({ ok: false, error: { code: "invalid_grant" } }, { status: 400 });
  const session = await createSession(userId);
  return Response.json({ ok: true, token: session.token, expiresAt: session.expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
