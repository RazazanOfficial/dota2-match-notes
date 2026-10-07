import { logFailure } from "../../../../http/log";
import { timingSafeEqual } from "node:crypto";
import type { HttpRequest } from "../../../../http/protocol";
import { HttpResponse } from "../../../../http/protocol";
import {
  getAppUrl,
  STEAM_STATE_COOKIE,
  useSecureCookies,
} from "../../../../lib/auth/config";
import { createSession } from "../../../../lib/auth/session";
import { createDesktopAuthCode, parseDesktopState } from "../../../../lib/auth/desktop";
import { setSessionCookie } from "../../../../lib/auth/session-cookie";
import { fetchSteamProfile, verifySteamOpenId } from "../../../../lib/auth/steam";
import { upsertSteamUser } from "../../../../lib/auth/user";


function statesMatch(received: string | null, saved: string | undefined) {
  if (!received || !saved) return false;

  const receivedBuffer = Buffer.from(received);
  const savedBuffer = Buffer.from(saved);

  return (
    receivedBuffer.length === savedBuffer.length &&
    timingSafeEqual(receivedBuffer, savedBuffer)
  );
}

function clearState(response: HttpResponse) {
  response.cookies.set(STEAM_STATE_COOKIE, "", {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export async function GET(request: HttpRequest) {
  const receivedState = request.parsedUrl.searchParams.get("state");
  const savedState = request.cookies.get(STEAM_STATE_COOKIE)?.value;
  const desktop = parseDesktopState(savedState);

  if (!receivedState || !statesMatch(receivedState, desktop?.state || savedState)) {
    const response = HttpResponse.json(
      { ok: false, error: "invalid_auth_state" },
      { status: 400 },
    );
    clearState(response);
    return response;
  }

  try {
    const steamId = await verifySteamOpenId(
      request.parsedUrl.searchParams,
      receivedState,
    );
    const profile = await fetchSteamProfile(steamId);
    const user = await upsertSteamUser(profile);
    if (desktop) {
      const code = await createDesktopAuthCode(user.id, desktop.challenge);
      const target = new URL("dota-notes://auth/callback");
      target.searchParams.set("code", code);
      target.searchParams.set("nonce", desktop.nonce);
      const response = HttpResponse.redirect(target, 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      clearState(response);
      return response;
    }
    const session = await createSession(user.id);
    const response = HttpResponse.redirect(new URL("/", getAppUrl()));

    setSessionCookie(response, session);
    clearState(response);

    return response;
  } catch (error) {
    logFailure("Steam authentication failed", error);
    const response = HttpResponse.json(
      { ok: false, error: "steam_authentication_failed" },
      { status: 400 },
    );
    clearState(response);
    return response;
  }
}
