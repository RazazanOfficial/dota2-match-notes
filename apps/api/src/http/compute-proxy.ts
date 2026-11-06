import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";
import { COMPUTE_HEADER, isComputeRoute, isInternalPath, validComputeToken, type Topology } from "../runtime/topology";
const hopHeaders = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", COMPUTE_HEADER]);
function filteredHeaders(input: IncomingHttpHeaders) {
  const extra = new Set(String(input.connection || "").toLowerCase().split(",").map(s => s.trim()));
  return Object.fromEntries(Object.entries(input).filter(([name]) => !hopHeaders.has(name) && !extra.has(name)));
}
export function topologyMiddleware(config: Topology): RequestHandler {
  return (req, res, next) => {
    if (config.role === "standalone") { next(); return; }
    if (config.role === "compute") {
      if (!isInternalPath(req.path) && !(isComputeRoute(req.method, req.path) && validComputeToken(req.get(COMPUTE_HEADER), config.computeToken))) {
        res.status(404).json({ ok: false, error: { code: "not_found" } }); return;
      }
      next(); return;
    }
    if (isInternalPath(req.path)) { res.status(404).json({ ok: false, error: { code: "not_found" } }); return; }
    if (!isComputeRoute(req.method, req.path)) { next(); return; }
    const headers = filteredHeaders(req.headers);
    headers[COMPUTE_HEADER] = config.computeToken;
    headers["x-forwarded-for"] = req.ip || req.socket.remoteAddress || "";
    headers["x-real-ip"] = headers["x-forwarded-for"];
    headers["x-forwarded-proto"] = req.protocol;
    headers["accept-encoding"] = "identity";
    const upstream = httpRequest(config.computeOrigin, { method: req.method, path: req.originalUrl, headers });
    let finished = false;
    const fail = (code: "compute_unavailable" | "compute_timeout") => {
      if (finished) return;
      finished = true; clearTimeout(timer); req.unpipe(upstream); upstream.destroy();
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      for (const name of ["content-length", "content-encoding", "content-type", "set-cookie"]) res.removeHeader(name);
      res.setHeader("Retry-After", "5");
      res.status(503).json({ ok: false, error: { code, message: "ارتباط با سرویس پردازش موقتا در دسترس نیست؛ کمی بعد دوباره تلاش کنید" } });
      req.resume();
    };
    const timer = setTimeout(() => fail("compute_timeout"), config.timeoutMs); timer.unref();
    upstream.on("error", () => fail("compute_unavailable"));
    upstream.on("response", source => {
      if (finished) { source.destroy(); return; }
      res.statusCode = source.statusCode || 502;
      for (const [name, value] of Object.entries(filteredHeaders(source.headers))) if (value !== undefined) res.setHeader(name, value);
      source.on("error", () => fail("compute_unavailable"));
      source.on("aborted", () => fail("compute_unavailable"));
      source.on("end", () => { finished = true; clearTimeout(timer); });
      source.pipe(res);
    });
    req.on("aborted", () => { finished = true; clearTimeout(timer); upstream.destroy(); });
    res.on("close", () => { clearTimeout(timer); if (!finished) { finished = true; upstream.destroy(); } });
    req.pipe(upstream);
  };
}
