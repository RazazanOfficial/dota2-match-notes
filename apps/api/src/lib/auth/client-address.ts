import type { HttpRequest } from "../../http/protocol";

// Nginx overwrites X-Real-IP with its socket peer. X-Forwarded-For can
// contain caller-supplied data and must never key the login limiter.
export function clientAddress(request: HttpRequest) {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
