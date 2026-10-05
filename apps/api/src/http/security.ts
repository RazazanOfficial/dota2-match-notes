import type { RequestHandler } from "express";

export function configuredOrigins(extra: readonly string[] = []): string[] {
  const inputs = [process.env.APP_URL, process.env.API_PUBLIC_ORIGIN, ...(process.env.API_ALLOWED_ORIGINS || "").split(","), ...extra];
  return [...new Set(inputs.filter((x): x is string => !!x?.trim()).map(value => {
    const trimmed = value.trim(); const url = new URL(trimmed);
    if (!["http:", "https:", "tauri:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || (url.pathname && url.pathname !== "/")) throw new Error("Invalid API origin");
    return url.protocol === "tauri:" ? trimmed.replace(/\/$/, "") : url.origin;
  }))];
}
export function originGuard(origins: readonly string[]): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("origin");
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if ((origin && !origins.includes(origin)) ||
        (unsafe && !origin && (request.get("cookie") || request.get("sec-fetch-site") === "cross-site"))) {
      response.status(403).json({ ok: false, error: { code: "invalid_origin", message: "مبدأ درخواست معتبر نیست" } }); return;
    }
    next();
  };
}
/** Bounded process guard supplements persistent domain quotas and locks. */
export function requestRateLimit(limit: number, windowMs: number): RequestHandler {
  const entries = new Map<string, { count: number; endsAt: number }>();
  return (request, response, next) => {
    const now = Date.now();
    if (entries.size >= 20_000) for (const [key, item] of entries) if (item.endsAt <= now) entries.delete(key);
    const key = request.ip || request.socket.remoteAddress || "unknown";
    let item = entries.get(key);
    if (!item || item.endsAt <= now) {
      if (entries.size >= 20_000 && !entries.has(key)) {
        response.status(503).json({ ok: false, error: { code: "rate_limiter_capacity" } }); return;
      }
      item = { count: 0, endsAt: now + windowMs }; entries.set(key, item);
    }
    item.count++;
    if (item.count > limit) {
      response.setHeader("Retry-After", Math.max(1, Math.ceil((item.endsAt - now) / 1_000)));
      response.status(429).json({ ok: false, error: { code: "rate_limited" } }); return;
    }
    next();
  };
}
