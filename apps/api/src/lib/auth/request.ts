import type { HttpRequest } from "../../http/protocol";
import { getAppUrl, SESSION_COOKIE } from "./config";
import { getSessionUser } from "./session";
import { configuredOrigins } from "../../http/security";

export function requestSessionToken(request: HttpRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization) return /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization)?.[1];
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export function getRequestUser(request: HttpRequest) {
  const token = requestSessionToken(request);
  return getSessionUser(token);
}

export function hasValidRequestOrigin(request: HttpRequest) {
  const origin = request.headers.get("origin");
  if (origin) return configuredOrigins().includes(origin);
  return !request.headers.get("cookie") && request.headers.get("sec-fetch-site") !== "cross-site";
}
