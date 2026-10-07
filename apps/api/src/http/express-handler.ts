import type { Request, Response as ExpressResponse, RequestHandler } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HttpRequest, type HttpHandler } from "./protocol";

export function handlerBodyLimit(path: string): number {
  if (path === "/auth/password/login") return 4_096;
  if (path === "/sync/me" || path.startsWith("/internal/")) return 1_024;
  if (path.startsWith("/journal/days/")) return 512_000;
  return 64 * 1_024;
}
function requestHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || /^(host|x-real-ip|x-forwarded-|forwarded)/i.test(name)) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  headers.set("x-real-ip", request.ip || request.socket.remoteAddress || "unknown");
  return headers;
}
async function sendResponse(response: Response, target: ExpressResponse, head: boolean) {
  target.status(response.status);
  for (const [key, value] of response.headers) {
    if (/^(set-cookie|connection|keep-alive|transfer-encoding|proxy-authenticate|upgrade)$/i.test(key)) continue;
    target.setHeader(key, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) target.setHeader("set-cookie", cookies);
  if (!response.body) { target.end(); return; }
  if (head) { await response.body.cancel(); target.end(); return; }
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), target);
}
export function expressHandler(handler: HttpHandler, publicOrigin: string): RequestHandler {
  return async (request, response, next) => {
    const controller = new AbortController();
    const abort = () => { if (!response.writableFinished) controller.abort(); };
    request.once("aborted", abort); response.once("close", abort);
    try {
      const headers = requestHeaders(request);
      const body = request.body instanceof Buffer && request.body.length ? request.body : undefined;
      const adapted = new HttpRequest(new URL(request.originalUrl, publicOrigin), {
        method: request.method === "HEAD" ? "GET" : request.method, headers, signal: controller.signal,
        ...(body ? { body: new Uint8Array(body) } : {}),
      }, request.ip || request.socket.remoteAddress || "unknown");
      const params = Object.fromEntries(Object.entries(request.params).map(([key, value]) => [key, String(value)]));
      const result = await handler(adapted, { params: Promise.resolve(params) });
      await sendResponse(result, response, request.method === "HEAD");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (response.headersSent) { response.destroy(); return; }
      next(error);
    } finally { request.off("aborted", abort); response.off("close", abort); }
  };
}
