import { logFailure } from "./http/log";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { parse as parseCookie } from "cookie";
import { routes } from "./routes/registry";
import { expressHandler, handlerBodyLimit } from "./http/express-handler";
import { configuredOrigins, originGuard, requestRateLimit } from "./http/security";
import type { HttpHandler } from "./http/protocol";
import { verifyDatabaseSchema } from "./lib/db/compatibility";
import { getSessionUser } from "./lib/auth/session";
import { SESSION_COOKIE } from "./lib/auth/config";

export function createApp(allowedOrigins: readonly string[] = []) {
  const app = express();
  const origins = configuredOrigins(allowedOrigins);
  const publicOrigin = process.env.API_PUBLIC_ORIGIN || process.env.APP_URL || "http://127.0.0.1:4100";
  const trustedProxies = (process.env.API_TRUST_PROXY || "").split(",").map(x => x.trim()).filter(Boolean);
  app.disable("x-powered-by");
  app.set("trust proxy", trustedProxies.length ? trustedProxies : false);
  app.set("query parser", "simple");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(originGuard(origins));
  app.use(cors({ origin: (origin, callback) => callback(null, !!origin && origins.includes(origin)),
    credentials: true, methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"], exposedHeaders: ["Retry-After", "Content-Disposition"], maxAge: 600 }));
  app.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/health/live", (_request, response) => response.json({ ok: true, service: "dota-notes-api", status: "running" }));
  app.get("/health/ready", async (_request, response) => {
    try { await verifyDatabaseSchema(); response.json({ ok: true, status: "ready" }); }
    catch { response.status(503).json({ ok: false, status: "database_unavailable_or_unmigrated" }); }
  });
  app.use(requestRateLimit(600, 60_000));
  // Preserve the original desktop SDK contract; readiness has separate endpoints.
  app.get("/api/v1/health", (_request, response) => {
    response.setHeader("Deprecation", "true");
    response.json({ ok: true, service: "dota-notes-api", apiVersion: "v1", status: "foundation" });
  });
  const loginLimit = requestRateLimit(20, 60_000);
  const router = express.Router();
  for (const route of routes) {
    const middleware: express.RequestHandler[] = [];
    if (route.path === "/auth/password/login" || route.path === "/auth/steam" || route.path.startsWith("/auth/desktop/") || route.path.startsWith("/auth/recovery/") || route.path.startsWith("/auth/email/") || route.path === "/auth/signup/codes/reissue") middleware.push(loginLimit);
    if (!route.path.startsWith("/auth/") && !route.path.startsWith("/internal/") && route.path !== "/health") {
      middleware.push((request, response, next) => {
        const authorization = request.get("authorization");
        const token = authorization ? /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization)?.[1]
          : parseCookie(request.get("cookie") || "")[SESSION_COOKIE];
        if (!token) { next(); return; }
        void getSessionUser(token).then(user => {
          if (user && !user.onboardingCompletedAt) {
            response.status(409).json({ ok: false, error: { code: "onboarding_required", message: "ثبت‌نام را کامل کنید" } });
          } else next();
        }).catch(next);
      });
    }
    if (!["GET", "HEAD"].includes(route.method)) {
      middleware.push(express.raw({ type: () => true, limit: handlerBodyLimit(route.path), inflate: false }));
      middleware.push((request, response, next) => {
        if (request.body?.length && !/^application\/json(?:\s*;|$)/i.test(request.get("content-type") || "")) {
          response.status(415).json({ ok: false, error: { code: "unsupported_media_type" } }); return;
        }
        next();
      });
    }
    router[route.method.toLowerCase() as "get" | "post" | "put" | "delete"](
      route.path, ...middleware, expressHandler(route.handler as unknown as HttpHandler, publicOrigin),
    );
  }
  for (const path of new Set(routes.map(route => route.path))) {
    const methods = routes.filter(route => route.path === path).map(route => route.method as string);
    if (methods.includes("GET")) methods.push("HEAD");
    router.all(path, (_request, response) => {
      response.setHeader("Allow", [...methods, "OPTIONS"].join(", "));
      response.status(405).json({ ok: false, error: { code: "method_not_allowed" } });
    });
  }
  app.use("/api/v1", router);
  app.use("/api", router);
  app.use((_request, response) => { response.status(404).json({ ok: false, error: { code: "not_found" } }); });
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = error?.type === "entity.too.large" ? 413 : error?.type === "encoding.unsupported" ? 415 : error instanceof URIError ? 400 : 500;
    if (status === 500) logFailure("API request failed", { name: error instanceof Error ? error.name : "Error" });
    response.status(status).json({ ok: false, error: { code: status === 413 ? "payload_too_large" : status === 415 ? "unsupported_encoding" : status === 400 ? "invalid_url" : "internal_error" } });
  };
  app.use(errors);
  return app;
}
