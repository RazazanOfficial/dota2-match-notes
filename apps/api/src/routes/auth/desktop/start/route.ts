import { randomBytes } from "node:crypto";
import type { HttpRequest } from "../../../../http/protocol";
import { HttpResponse } from "../../../../http/protocol";
import { STEAM_STATE_COOKIE, STEAM_STATE_DURATION_SECONDS, useSecureCookies } from "../../../../lib/auth/config";
import { isDesktopChallenge, isDesktopNonce } from "../../../../lib/auth/desktop";
import { buildSteamLoginUrl } from "../../../../lib/auth/steam";

export async function GET(request: HttpRequest) {
  const challenge = request.parsedUrl.searchParams.get("challenge");
  const nonce = request.parsedUrl.searchParams.get("nonce");
  if (!isDesktopChallenge(challenge) || !isDesktopNonce(nonce)) {
    return HttpResponse.json({ ok: false, error: { code: "invalid_desktop_auth_request" } }, { status: 400 });
  }
  const state = randomBytes(32).toString("base64url");
  const response = HttpResponse.redirect(buildSteamLoginUrl(state));
  response.cookies.set(STEAM_STATE_COOKIE, `${state}.${challenge}.${nonce}`, {
    httpOnly: true, secure: useSecureCookies(), sameSite: "lax",
    maxAge: STEAM_STATE_DURATION_SECONDS, path: "/",
  });
  return response;
}
