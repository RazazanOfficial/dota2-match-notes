import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAppUrl,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  STEAM_STATE_COOKIE,
  useSecureCookies,
} from "@/lib/auth/config";
import { createSession } from "@/lib/auth/session";
import { fetchSteamProfile, verifySteamOpenId } from "@/lib/auth/steam";
import { upsertSteamUser } from "@/lib/auth/user";

export const runtime = "nodejs";

function statesMatch(received: string | null, saved: string | undefined) {
  if (!received || !saved) return false;

  const receivedBuffer = Buffer.from(received);
  const savedBuffer = Buffer.from(saved);

  return (
    receivedBuffer.length === savedBuffer.length &&
    timingSafeEqual(receivedBuffer, savedBuffer)
  );
}

function clearState(response: NextResponse) {
  response.cookies.set(STEAM_STATE_COOKIE, "", {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export async function GET(request: NextRequest) {
  const receivedState = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get(STEAM_STATE_COOKIE)?.value;

  if (!receivedState || !statesMatch(receivedState, savedState)) {
    const response = NextResponse.json(
      { ok: false, error: "invalid_auth_state" },
      { status: 400 },
    );
    clearState(response);
    return response;
  }

  try {
    const steamId = await verifySteamOpenId(
      request.nextUrl.searchParams,
      receivedState,
    );
    const profile = await fetchSteamProfile(steamId);
    const user = await upsertSteamUser(profile);
    const session = await createSession(user.id);
    const response = NextResponse.redirect(new URL("/", getAppUrl()));

    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: useSecureCookies(),
      sameSite: "lax",
      maxAge: SESSION_DURATION_SECONDS,
      expires: session.expiresAt,
      path: "/",
    });
    clearState(response);

    return response;
  } catch (error) {
    console.error("Steam authentication failed", error);
    const response = NextResponse.json(
      { ok: false, error: "steam_authentication_failed" },
      { status: 400 },
    );
    clearState(response);
    return response;
  }
}
