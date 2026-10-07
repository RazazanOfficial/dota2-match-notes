import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  useSecureCookies,
} from "./config";

export function setSessionCookie(
  response: NextResponse,
  session: { token: string; expiresAt: Date },
) {
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    expires: session.expiresAt,
    path: "/",
  });
}
