import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "./config";
import { getSessionUser } from "./session";

export function getRequestUser(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}
