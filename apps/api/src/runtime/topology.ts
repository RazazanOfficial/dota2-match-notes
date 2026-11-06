import { createHash, timingSafeEqual } from "node:crypto";
import { getNodeRole, type NodeRole } from "../../scripts/node-role.mjs";
export { getNodeRole, requireComputeNode } from "../../scripts/node-role.mjs";
export const COMPUTE_HEADER = "x-dota-compute-token";
export interface Topology { role: NodeRole; computeOrigin: string; computeToken: string; timeoutMs: number }
function safeUrl(value: string, name: string) {
  try { return new URL(value); } catch { throw new Error(`Invalid ${name}`); }
}
export function getTopology(env = process.env): Topology {
  const role = getNodeRole(env);
  if (role === "standalone") return { role, computeOrigin: "", computeToken: "", timeoutMs: 0 };
  const computeToken = env.DOTA_COMPUTE_TOKEN?.trim() || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(computeToken) || /CHANGE_ME|YOUR_|REPLACE_/i.test(computeToken)) throw new Error("Invalid DOTA_COMPUTE_TOKEN");
  const timeoutMs = Number(env.DOTA_COMPUTE_TIMEOUT_MS?.trim() || 180_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180_000) throw new Error("Invalid DOTA_COMPUTE_TIMEOUT_MS");
  let computeOrigin = "";
  if (role === "app") {
    const url = safeUrl(env.DOTA_COMPUTE_ORIGIN || "http://127.0.0.1:14100", "DOTA_COMPUTE_ORIGIN");
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash) throw new Error("Invalid DOTA_COMPUTE_ORIGIN");
    computeOrigin = url.origin;
  }
  return { role, computeOrigin, computeToken, timeoutMs };
}
export function validateDatabaseTopology(connectionString: string, env = process.env) {
  const role = getNodeRole(env);
  if (role === "standalone") return;
  const url = safeUrl(connectionString, "DATABASE_URL");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || (url.port || "5432") !== (role === "compute" ? "15432" : "5432") || url.pathname.length < 2) throw new Error("Database connection does not match the node topology");
}
export function validComputeToken(value: string | undefined, expected: string) {
  if (!value || !expected) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(value), digest(expected));
}
export const isInternalPath = (path: string) => /^\/api\/(?:v1\/)?internal(?:\/|$)/i.test(path);
// Reads and durable queue submissions stay in Iran. Only explicit upstream or
// expensive account handlers cross the authenticated, fixed private bridge.
export function isComputeRoute(method: string, path: string) {
  const p = path.toLowerCase().replace(/^\/api\/(?:v1\/)?/, "/").replace(/\/$/, "");
  const m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  if (m === "GET") return ["/auth/steam", "/auth/steam/callback", "/auth/desktop/start", "/admin/stratz-diagnostics", "/admin/replay-archive", "/admin/replay-monitor", "/admin/service-monitor"].includes(p);
  if (m === "POST") return ["/auth/desktop/exchange", "/auth/password/login", "/auth/signup/password", "/auth/signup/complete", "/auth/signup/codes/reissue", "/auth/signup/codes/saved", "/auth/email/start", "/auth/email/verify", "/auth/recovery/request", "/auth/recovery/reset", "/replays/lookup", "/admin/users", "/admin/replay-archive"].includes(p) || /^\/matches\/[^/]+\/opendota$/.test(p) || /^\/admin\/users\/[^/]+\/matches\/reprocess$/.test(p);
  return (m === "PUT" || m === "DELETE") && (p === "/auth/password/me" || /^\/admin\/users\/[^/]+\/password$/.test(p));
}
