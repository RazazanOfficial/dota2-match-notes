import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAppUrl,
  SESSION_COOKIE,
  useSecureCookies,
} from "@/lib/auth/config";
import { deleteSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (origin && origin !== getAppUrl()) {
    return NextResponse.json(
      { ok: false, error: "invalid_origin" },
      { status: 403 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  await deleteSession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
