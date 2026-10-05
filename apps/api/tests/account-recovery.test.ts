import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { compare } from "bcryptjs";
import nodemailer from "nodemailer";
import { passwordLoginSchema } from "../src/lib/auth/password-validation";
const state = vi.hoisted(() => ({ db: undefined as unknown, sendMail: vi.fn(), closeMail: vi.fn() }));
vi.mock("../src/lib/db", () => ({ getDb: () => state.db }));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail: state.sendMail, close: state.closeMail })) } }));
import { users, sessions, accountRecoveryCodes } from "../src/lib/db/schema";
import { enrollPasswordAndCodes, isStrongAccountPassword, resetAccountPassword, sendAccountEmail, startEmailChallenge, verifyAccountEmail } from "../src/lib/auth/recovery";
const client = new PGlite(); const db = drizzle(client); state.db = db;
let userId = "";
beforeAll(async () => {
  await migrate(db, { migrationsFolder: join(fileURLToPath(new URL("..", import.meta.url)), "drizzle") });
  const [user] = await db.insert(users).values({ steamId: "76561197960265729", steamAccountId: 1, handle: "recover_user", displayName: "Recovery user" }).returning({ id: users.id });
  userId = user.id;
}, 60_000);
afterAll(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await client.close(); });
describe("account registration and recovery", () => {
  it("requires all password conditions and permits a strong six-character login", () => {
    expect(isStrongAccountPassword("Aa1!xx")).toBe(true);
    expect(isStrongAccountPassword("Aa1xxx")).toBe(false);
    expect(passwordLoginSchema.parse({ steamIdentifier: "1", password: "Aa1!xx" }).password).toBe("Aa1!xx");
  });
  it("issues six hashed one-use codes and revokes active sessions on reset", async () => {
    const codes = await enrollPasswordAndCodes(userId, "Aa1!xx");
    expect(codes).toHaveLength(6); expect(new Set(codes).size).toBe(6);
    const stored = await db.select().from(accountRecoveryCodes).where(eq(accountRecoveryCodes.userId, userId));
    expect(stored).toHaveLength(6);
    expect(stored.every(item => codes.every(code => item.codeHash !== code))).toBe(true);
    await db.insert(sessions).values({ userId, tokenHash: "c".repeat(64), expiresAt: new Date(Date.now() + 60_000) });
    await resetAccountPassword(userId, "recovery", codes[0], "Bb2@yy");
    expect((await db.select().from(sessions).where(eq(sessions.userId, userId)))).toHaveLength(0);
    await expect(resetAccountPassword(userId, "recovery", codes[0], "Cc3#zz")).rejects.toMatchObject({ code: "invalid_recovery_code" });
    expect(await compare("Bb2@yy", (await db.select().from(users).where(eq(users.id, userId)))[0].passwordHash!)).toBe(true);
  }, 30_000);
  it("verifies a code sent by email and allows a one-time email reset", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("AUTH_EMAIL_FROM", "test@example.org");
    const sent: Array<{ html: string; to: string }> = [];
    state.sendMail.mockImplementation(async message => { sent.push(message); return { accepted: [message.to], rejected: [] }; });
    await startEmailChallenge(userId, "name@example.org", "verify");
    expect(vi.mocked(nodemailer.createTransport)).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.resend.com", port: 465, secure: true, authMethod: "PLAIN", auth: { user: "resend", pass: "test-key" },
    }));
    const firstCode = sent[0].html.match(/letter-spacing:12px[^>]*>(\d{6})</)?.[1];
    expect(firstCode).toMatch(/^\d{6}$/);
    expect(await verifyAccountEmail(userId, firstCode!)).toBe(true);
    expect((await db.select().from(users).where(eq(users.id,userId)))[0].recoveryEmail).toBe("name@example.org");
    await startEmailChallenge(userId, "name@example.org", "reset");
    const resetCode = sent[1].html.match(/letter-spacing:12px[^>]*>(\d{6})</)?.[1];
    await resetAccountPassword(userId, "email", resetCode!, "Dd4$qq");
    await expect(resetAccountPassword(userId, "email", resetCode!, "Ee5%rr")).rejects.toMatchObject({ code: "invalid_recovery_code" });
  }, 30_000);
  it("returns a mail-specific error for transport and provider failures", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("AUTH_EMAIL_FROM", "test@example.org");
    state.sendMail.mockRejectedValueOnce(Object.assign(new Error("Network unavailable"), { code: "ECONNRESET" }));
    await expect(sendAccountEmail("name@example.org", "verify", "123456")).rejects.toMatchObject({ status: 503, code: "email_transport_unavailable" });
    state.sendMail.mockRejectedValueOnce(Object.assign(new Error("Provider rejected"), { responseCode: 550 }));
    await expect(sendAccountEmail("name@example.org", "verify", "123456")).rejects.toMatchObject({ status: 503, code: "email_delivery_failed" });
    state.sendMail.mockResolvedValueOnce({ accepted: [], rejected: ["name@example.org"] });
    await expect(sendAccountEmail("name@example.org", "verify", "123456")).rejects.toMatchObject({ status: 503, code: "email_delivery_failed" });
    expect(state.closeMail).toHaveBeenCalledTimes(5);
  });
});
