import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
describe("Express real controller boundaries", () => {
 it("preserves the uploaded desktop SDK health response", async () => {
  const response=await request(createApp()).get("/api/v1/health");
  expect(response.body).toEqual({ok:true,service:"dota-notes-api",apiVersion:"v1",status:"foundation"});
  expect(response.headers.deprecation).toBe("true");
 });
 it("runs without Next.js and returns an anonymous session", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const app=createApp();
  expect((await request(app).get("/health/live")).body.status).toBe("running");
  expect((await request(app).get("/api/auth/session")).body).toEqual({authenticated:false});
  expect((await request(app).get("/api/v1/auth/session")).body).toEqual({authenticated:false});
 });
 it("does not fake database readiness", async () => {
  vi.stubEnv("DATABASE_URL", "");
  expect((await request(createApp()).get("/health/ready")).status).toBe(503);
 });
 it("requires authorization on administration and rejects method misuse", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const app=createApp();
  expect((await request(app).get("/api/admin/users")).status).toBe(401);
  expect((await request(app).get("/api/internal/sync/tick")).status).toBe(405);
 });
});
