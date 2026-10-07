/** Next.js is a frontend gateway only; all API business logic runs in Express. */
export function backendOrigin() {
  const url = new URL(process.env.API_INTERNAL_ORIGIN || "http://127.0.0.1:4100");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("API_INTERNAL_ORIGIN must be a server-controlled origin");
  }
  return url.origin;
}
const hopHeaders = /^(host|connection|keep-alive|transfer-encoding|proxy-authenticate|upgrade|content-length|x-real-ip|x-forwarded-.*|forwarded)$/i;
async function limitedBody(request: Request) {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 512_000) { await reader.cancel(); throw new Error("payload_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
export async function forwardApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const internal = /^\/api\/(?:v1\/)?internal(?:\/|$)/i.test(pathname);
  if (!url.pathname.startsWith("/api/") || internal) return Response.json({ ok: false, error: { code: "not_found" } }, { status: 404 });
  try {
    const headers = new Headers();
    for (const [key, value] of request.headers) if (!hopHeaders.test(key)) headers.set(key, value);
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await limitedBody(request);
    const upstream = await fetch(new URL(url.pathname + url.search, backendOrigin()), {
      method: request.method, headers, body, redirect: "manual", cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(310_000)]),
    });
    const outgoing = new Headers();
    for (const [key, value] of upstream.headers) if (!hopHeaders.test(key) && key !== "set-cookie") outgoing.set(key, value);
    for (const value of upstream.headers.getSetCookie()) outgoing.append("set-cookie", value);
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "payload_too_large";
    return Response.json({ ok: false, error: { code: tooLarge ? "payload_too_large" : "backend_unavailable" } }, { status: tooLarge ? 413 : 503 });
  }
}
