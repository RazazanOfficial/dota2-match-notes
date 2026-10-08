import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { HttpResponse, type HttpRequest } from "../src/http/protocol";

vi.mock("../src/routes/registry", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/routes/registry")>();
  return { routes: actual.routes.map(route => ({ ...route, handler: async (req: HttpRequest, context: { params: Promise<Record<string,string>> }) => {
    const result = HttpResponse.json({ route: route.path, method: req.method, params: await context.params,
      url: req.parsedUrl.pathname, query: req.parsedUrl.searchParams.get("test"), body: await req.text(), ip: req.clientIp,
      realIp: req.headers.get("x-real-ip"), forwarded: req.headers.get("x-forwarded-for") });
    if (route.path === "/auth/steam/callback") {
      result.cookies.set("one", "value", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
      result.cookies.set("two", "", { maxAge: 0, path: "/" });
    }
    return result;
  } })) };
});
import { createApp } from "../src/app";
import inventory from "../../../docs/backend-source-inventory.json";

beforeEach(() => { vi.stubEnv("APP_URL", "https://dota.example"); vi.stubEnv("API_TRUST_PROXY", ""); vi.stubEnv("API_ALLOWED_ORIGINS", "http://localhost:1420"); });
describe("all original routes over Express", () => {
  for (const route of inventory.routes) for (const method of route.methods) {
    it(`${method} ${route.path} supports both legacy and v1 paths`, async () => {
      const path = route.path.replace(/\[([^\]]+)\]/g, (_, key) => key === "date" ? "2026-10-03" : key === "handle" ? "merij" : "9008411473");
      for (const prefix of ["/api", "/api/v1"]) {
        const response = await (request(createApp()) as unknown as Record<string, (path:string)=>request.Test>)[method.toLowerCase()](path.replace(/^\/api/, prefix) + "?test=value");
        expect(response.status).toBe(200);
        if (route.path === "/api/health" && prefix === "/api/v1") {
          expect(response.body.apiVersion).toBe("v1");
          expect(response.headers.deprecation).toBe("true");
          continue;
        }
        expect(response.body.route).toBe(route.path.replace(/^\/api/, "").replace(/\[([^\]]+)\]/g, ":$1"));
        expect(response.body.method).toBe(method);
        expect(response.body.query).toBe("value");
        for (const key of [...route.path.matchAll(/\[([^\]]+)\]/g)].map(x => x[1])) expect(response.body.params[key]).toBeDefined();
      }
    });
  }
});
describe("transport security and semantics", () => {
  it("passes raw JSON without changing its meaning", async () => {
    const response = await request(createApp()).put("/api/journal/days/2026-10-03").set("Origin", "https://dota.example").send({ matches: [], note: "سلام" });
    expect(response.status).toBe(200); expect(JSON.parse(response.body.body).note).toBe("سلام");
  });
  it("enforces route body limits even when no content-length is claimed", async () => {
    const response = await request(createApp()).post("/api/auth/password/login").set("Content-Type", "application/json").send("x".repeat(4097));
    expect(response.status).toBe(413);
    const accepted = await request(createApp()).put("/api/journal/days/2026-10-03").set("Content-Type", "application/json").send("x".repeat(8000));
    expect(accepted.status).toBe(200);
  });
  it("rejects compressed and non-JSON bodies", async () => {
    expect((await request(createApp()).post("/api/sync/me").set("Content-Encoding", "gzip").send({})).status).toBe(415);
    expect((await request(createApp()).post("/api/sync/me").set("Content-Type", "text/plain").send("hello")).status).toBe(415);
  });
  it("requires trusted origins for cookie mutations and rejects hostile browser origins", async () => {
    expect((await request(createApp()).post("/api/auth/logout").set("Cookie", "session=abc")).status).toBe(403);
    expect((await request(createApp()).post("/api/auth/logout").set("Cookie", "session=abc").set("Origin", "https://dota.example")).status).toBe(200);
    expect((await request(createApp()).get("/api/auth/session").set("Origin", "https://hostile.example")).status).toBe(403);
    const allowed = await request(createApp()).get("/api/auth/session").set("Origin", "http://localhost:1420");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:1420");
  });
  it("ignores forged real and forwarded IP headers without trusted proxies", async () => {
    const response = await request(createApp()).get("/api/auth/session").set("X-Real-IP", "203.0.113.5").set("X-Forwarded-For", "203.0.113.6");
    expect(response.body.ip).not.toContain("203.0.113");
    expect(response.body.realIp).toBe(response.body.ip); expect(response.body.forwarded).toBeNull();
  });
  it("keeps independent cookies and cookie security attributes", async () => {
    const response = await request(createApp()).get("/api/auth/steam/callback");
    expect(response.headers["set-cookie"]).toHaveLength(2);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(response.headers["set-cookie"][1]).toContain("Max-Age=0");
  });
  it("provides HEAD semantics and distinguishes 404 from 405", async () => {
    expect((await request(createApp()).head("/api/auth/session")).text).toBeUndefined();
    const method = await request(createApp()).delete("/api/auth/session");
    expect(method.status).toBe(405); expect(method.headers.allow).toContain("GET");
    expect((await request(createApp()).get("/api/no-such-route")).status).toBe(404);
  });
  it("limits repeated login requests before expensive password work", async () => {
    const app = createApp();
    for (let i=0;i<20;i++) expect((await request(app).post("/api/auth/password/login")).status).toBe(200);
    const denied = await request(app).post("/api/auth/password/login");
    expect(denied.status).toBe(429); expect(Number(denied.headers["retry-after"])).toBeGreaterThan(0);
  });
});
