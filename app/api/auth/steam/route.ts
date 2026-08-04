import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  STEAM_STATE_COOKIE,
  STEAM_STATE_DURATION_SECONDS,
  useSecureCookies,
} from "@/lib/auth/config";
import { buildSteamLoginUrl } from "@/lib/auth/steam";

export const runtime = "nodejs";

export async function GET() {
  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(buildSteamLoginUrl(state));

  response.cookies.set(STEAM_STATE_COOKIE, state, {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    maxAge: STEAM_STATE_DURATION_SECONDS,
    path: "/",
  });

  return response;
}
