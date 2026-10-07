import type { HttpRequest } from "../../../http/protocol";
import { HttpResponse } from "../../../http/protocol";
import {
  getAppUrl,
  SESSION_COOKIE,
  useSecureCookies,
} from "../../../lib/auth/config";
import { deleteSession } from "../../../lib/auth/session";
import { hasValidRequestOrigin, requestSessionToken } from "../../../lib/auth/request";


export async function POST(request: HttpRequest) {
  if (!hasValidRequestOrigin(request)) {
    return HttpResponse.json(
      { ok: false, error: "invalid_origin" },
      { status: 403 },
    );
  }

  const token = requestSessionToken(request);
  await deleteSession(token);

  const response = HttpResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
