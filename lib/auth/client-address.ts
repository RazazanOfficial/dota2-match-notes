import type { NextRequest } from "next/server";

// Nginx overwrites X-Real-IP with its socket peer. X-Forwarded-For can
// contain caller-supplied data and must never key the login limiter.
export function clientAddress(request: NextRequest) {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
