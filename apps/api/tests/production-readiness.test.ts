import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getApiPublicUrl, useSecureCookies } from "../src/lib/auth/config";
import { buildSteamLoginUrl } from "../src/lib/auth/steam";
import { preflight } from "../src/runtime/preflight";
import request from "supertest";
import { createApp } from "../src/app";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://user:do-not-log-this@127.0.0.1:5432/notes");
  vi.stubEnv("APP_URL", "https://dota.example");
  vi.stubEnv("API_PUBLIC_ORIGIN", "https://api.dota.example");
  vi.stubEnv("API_PORT", "4100");
  vi.stubEnv("API_ALLOWED_ORIGINS", "tauri://localhost,http://tauri.localhost");
  vi.stubEnv("SYNC_WORKER_SECRET", "test-secret-with-more-than-32-characters");
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("independent API production configuration", () => {
  it("uses the API host for Steam verification while retaining the intro host", () => {
    const login = buildSteamLoginUrl("state");
    expect(login.searchParams.get("openid.realm")).toBe("https://api.dota.example");
    expect(new URL(login.searchParams.get("openid.return_to")!).origin).toBe("https://api.dota.example");
    expect(process.env.APP_URL).toBe("https://dota.example");
  });
  it("retains same-origin compatibility without the new setting", () => {
    vi.stubEnv("API_PUBLIC_ORIGIN", "");
    expect(getApiPublicUrl()).toBe("https://dota.example");
  });
  it("derives cookie security from the API and rejects credentials or callback paths", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(useSecureCookies()).toBe(true);
    for (const value of ["https://user:secret@example.test", "https://api.example.test/callback", "javascript:alert(1)"]) {
      vi.stubEnv("API_PUBLIC_ORIGIN", value); expect(() => getApiPublicUrl()).toThrow();
    }
  });
  it("permits exact desktop origins and rejects arbitrary origins", async () => {
    const app = createApp();
    expect((await request(app).get("/health/live").set("Origin", "tauri://localhost")).status).toBe(200);
    expect((await request(app).get("/health/live").set("Origin", "http://tauri.localhost")).headers["access-control-allow-origin"]).toBe("http://tauri.localhost");
    expect((await request(app).get("/health/live").set("Origin", "https://unknown.example")).status).toBe(403);
  });
  it("validates API configuration without claiming a live database connection", async () => {
    const result = await preflight();
    expect(result.ok).toBe(true); expect(result.checked).not.toContain("database_schema");
  });
  it("rejects invalid production inputs without logging connection strings or secrets", async () => {
    vi.stubEnv("API_PUBLIC_ORIGIN", "http://api.example.test");
    vi.stubEnv("API_PORT", "70000");
    vi.stubEnv("SYNC_WORKER_SECRET", "YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS");
    const result = await preflight();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining(["public_origins", "api_port", "worker_secret_and_sync_config"]));
    expect(JSON.stringify(result)).not.toContain("do-not-log-this");
    expect(JSON.stringify(result)).not.toContain("YOUR_RANDOM_SECRET");
  });
  it("detects missing replay prerequisites before launching the parser", async () => {
    vi.stubEnv("REPLAY_PARSER_JAR", "");vi.stubEnv("CLOUD_SPACE_ACCESS_KEY", "");
    const result = await preflight("replay");
    expect(result.ok).toBe(false);expect(result.failures).toContain("replay_parser_jar");
  });
  it("verifies backend portraits without depending on the web public directory", async () => {
    for (const [name, value] of Object.entries({CLOUD_SPACE_END_POINT_URL:"https://s3.example.test",CLOUD_SPACE_BUCKET:"test",CLOUD_SPACE_PUBLIC_BASE_URL:"https://cdn.example.test",CLOUD_SPACE_ACCESS_KEY:"test-access",CLOUD_SPACE_SECRET_KEY:"test-secret"})) vi.stubEnv(name,value);
    expect((await preflight("images")).ok).toBe(true);
    vi.stubEnv("API_ASSET_ROOT", "/definitely-missing-assets");
    expect((await preflight("images")).failures).toContain("backend_hero_portraits");
  });
});

describe("deployment independence", () => {
  function file(path: string) { return readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8"); }
  it("starts every HTTP worker after Express rather than the frontend", () => {
    for (const kind of ["sync","images","stratz","performance-reference","opendota-parse"]) {
      const unit=file(`deploy/systemd/dota2notes-${kind}.service`);
      expect(unit).toContain("After=network-online.target dota2notes-api.service");
      expect(unit).not.toContain("dota2notes.service");
      expect(unit).toContain("Environment=API_PORT=4100");
      expect(unit).toContain(`preflight.js --role=${kind}`);
    }
  });
  it("routes the dedicated API host only to Express and blocks internal operations", () => {
    const nginx=file("deploy/nginx/api.dota2notes.ir.conf");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:4100;");
    expect(nginx).not.toContain("3000");
    expect(nginx).toContain("^/api/(v1/)?internal(/|$)");
    expect(nginx).toContain("location = /health/ready { return 404; }");
  });
});
