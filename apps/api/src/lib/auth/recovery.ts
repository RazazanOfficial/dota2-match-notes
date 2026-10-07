import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import nodemailer from "nodemailer";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accountEmailChallenges, accountRecoveryCodes, sessions, users } from "../db/schema";
import { PasswordAuthError, hashPassword } from "./password";
import { logFailure } from "../../http/log";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (length: number) => Array.from(randomBytes(length), byte => alphabet[byte % alphabet.length]).join("");
const cleanCode = (value: string) => value.trim().toUpperCase().replace(/[\s-]/g, "");
const genericRecoveryError = () => new PasswordAuthError(400, "invalid_recovery_code", "کد معتبر نیست یا منقضی شده است");
const emailPattern = /^[^\s@<>]{1,64}@[^\s@<>]{1,189}\.[^\s@<>.]{2,}$/;
export function normalizeRecoveryEmail(input: string) {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !emailPattern.test(email)) throw new PasswordAuthError(400, "invalid_email", "آدرس ایمیل معتبر نیست");
  return email;
}
export function isStrongAccountPassword(value: string) {
  return value.length >= 6 && Buffer.byteLength(value, "utf8") <= 72 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^\p{L}\p{N}\s]/u.test(value);
}
export function requireStrongAccountPassword(password: string, confirmation: string) {
  if (!isStrongAccountPassword(password)) throw new PasswordAuthError(400, "weak_password", "رمز باید دست‌کم ۶ کاراکتر و شامل حروف کوچک و بزرگ، عدد و نماد باشد");
  if (password !== confirmation) throw new PasswordAuthError(400, "password_mismatch", "تکرار رمز یکسان نیست");
}

/** The plaintext is returned only once; replacement invalidates all previous codes. */
export async function enrollPasswordAndCodes(userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  const plaintext = Array.from({ length: 6 }, () => code(6));
  const hashed = await Promise.all(plaintext.map(value => hash(value, 12)));
  await getDb().transaction(async tx => {
    const [user] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).for("update");
    if (!user) throw new PasswordAuthError(404, "user_not_found", "حساب پیدا نشد");
    if (user.passwordHash) throw new PasswordAuthError(409, "already_enrolled", "رمز عبور این حساب قبلاً ساخته شده است");
    await tx.update(users).set({ passwordHash, passwordUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.insert(accountRecoveryCodes).values(hashed.map(codeHash => ({ userId, codeHash })));
  });
  return plaintext;
}

/** Replaces codes after an interrupted signup; the account password must be supplied again. */
export async function reissueSignupRecoveryCodes(userId: string, password: string) {
  const db = getDb();
  const [user] = await db.select({ passwordHash: users.passwordHash, completedAt: users.onboardingCompletedAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.passwordHash || user.completedAt || !await compare(password, user.passwordHash)) {
    throw new PasswordAuthError(401, "invalid_credentials", "رمز عبور معتبر نیست");
  }
  const plaintext = Array.from({ length: 6 }, () => code(6));
  const hashed = await Promise.all(plaintext.map(value => hash(value, 12)));
  await db.transaction(async tx => {
    const [current] = await tx.select({ passwordHash: users.passwordHash, completedAt: users.onboardingCompletedAt })
      .from(users).where(eq(users.id, userId)).for("update");
    if (!current?.passwordHash || current.passwordHash !== user.passwordHash || current.completedAt) {
      throw new PasswordAuthError(409, "account_changed", "وضعیت حساب تغییر کرده است؛ دوباره تلاش کنید");
    }
    await tx.delete(accountRecoveryCodes).where(eq(accountRecoveryCodes.userId, userId));
    await tx.insert(accountRecoveryCodes).values(hashed.map(codeHash => ({ userId, codeHash })));
    await tx.update(users).set({ recoveryCodesSavedAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
  });
  return plaintext;
}

export async function sendAccountEmail(to: string, purpose: "verify" | "reset", value: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!key || !from || /[\r\n]/.test(from)) throw new PasswordAuthError(503, "email_not_configured", "ارسال ایمیل هنوز روی سرور فعال نشده است");
  const title = purpose === "verify" ? "تأیید ایمیل حساب" : "بازیابی رمز عبور";
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body style="background:#10121c;margin:0;padding:32px;font-family:Tahoma,Arial,sans-serif;color:#f7f2e9"><table role="presentation" style="width:100%;max-width:540px;margin:auto;border:1px solid #393347;border-radius:22px;background:#1a1b2a"><tr><td style="padding:38px"><div style="color:#e9b668;font-size:13px;letter-spacing:2px">DOTA NOTES</div><h1 style="font-size:27px;margin:26px 0 10px;color:#fff">${title}</h1><p style="line-height:2;color:#c4bfd1">کد زیر را در برنامه وارد کنید. این کد تا ۱۰ دقیقه اعتبار دارد.</p><div dir="ltr" style="text-align:center;letter-spacing:12px;font-size:38px;font-weight:bold;border:1px solid #68557b;border-radius:16px;padding:20px;color:#ecca89;background:#242335">${value}</div><p style="font-size:12px;line-height:2;color:#aaa6b6;margin-top:24px">اگر شما این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید. کد را در اختیار دیگران قرار ندهید.</p></td></tr></table></body></html>`;
  const transport = nodemailer.createTransport({
    host: "smtp.resend.com", port: 465, secure: true,
    auth: { user: "resend", pass: key },
    authMethod: "PLAIN",
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000,
  });
  const startedAt = Date.now();
  try {
    const result = await transport.sendMail({ from, to, subject: `Dota Notes · ${title}`, html,
      text: `${title}\nکد: ${value}\nاعتبار: ۱۰ دقیقه\nاگر شما درخواست نداده‌اید، پیام را نادیده بگیرید.` });
    if (result.accepted.length !== 1 || result.rejected.length) {
      logFailure("Recovery email SMTP recipient rejected", { status: 503, elapsedMs: Date.now() - startedAt });
      throw new PasswordAuthError(503, "email_delivery_failed", "ارسال ایمیل انجام نشد؛ کمی بعد دوباره تلاش کنید");
    }
  } catch (error) {
    if (error instanceof PasswordAuthError) throw error;
    const status = error && typeof error === "object" && "responseCode" in error ? error.responseCode : undefined;
    logFailure("Recovery email SMTP failed", { error, status, elapsedMs: Date.now() - startedAt });
    throw new PasswordAuthError(503, typeof status === "number" && status >= 400 ? "email_delivery_failed" : "email_transport_unavailable",
      typeof status === "number" && status >= 400 ? "ارسال ایمیل انجام نشد؛ کمی بعد دوباره تلاش کنید" : "ارتباط با سرویس ایمیل برقرار نشد؛ کمی بعد دوباره تلاش کنید");
  } finally { transport.close(); }
}

export async function startEmailChallenge(userId: string, email: string, purpose: "verify" | "reset") {
  const db = getDb(), now = new Date();
  const [current] = await db.select({ sentAt: accountEmailChallenges.sentAt }).from(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, purpose))).limit(1);
  if (current && now.getTime() - current.sentAt.getTime() < 90_000) throw new PasswordAuthError(429, "email_cooldown", "برای ارسال دوباره کمی صبر کنید", Math.ceil((90_000 - (now.getTime() - current.sentAt.getTime())) / 1000));
  const value = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
  const codeHash = await hash(value, 12);
  await db.insert(accountEmailChallenges).values({ userId, email, purpose, codeHash, attempts: 0, expiresAt: new Date(now.getTime() + 600_000), sentAt: now })
    .onConflictDoUpdate({ target: [accountEmailChallenges.userId, accountEmailChallenges.purpose], set: { email, codeHash, attempts: 0, expiresAt: new Date(now.getTime() + 600_000), sentAt: now }, setWhere: sql`${accountEmailChallenges.sentAt} < now() - interval '90 seconds'` });
  const [stored] = await db.select({ sentAt: accountEmailChallenges.sentAt }).from(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, purpose)));
  if (!stored || stored.sentAt.getTime() !== now.getTime()) throw new PasswordAuthError(429, "email_cooldown", "برای ارسال دوباره کمی صبر کنید");
  try { await sendAccountEmail(email, purpose, value); }
  catch (error) { await db.delete(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, purpose), eq(accountEmailChallenges.sentAt, now))); throw error; }
}

export async function verifyAccountEmail(userId: string, value: string) {
  const db = getDb();
  const challenge = await db.select().from(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "verify"), gt(accountEmailChallenges.expiresAt, new Date()))).limit(1);
  if (!challenge[0] || challenge[0].attempts >= 5) throw genericRecoveryError();
  const valid = await compare(value.trim(), challenge[0].codeHash);
  return db.transaction(async tx => {
    const [current] = await tx.select().from(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "verify"))).for("update");
    if (!current || current.expiresAt <= new Date() || current.attempts >= 5 || current.codeHash !== challenge[0].codeHash || !valid) {
      if (current && current.codeHash === challenge[0].codeHash) await tx.update(accountEmailChallenges).set({ attempts: sql`${accountEmailChallenges.attempts} + 1` }).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "verify")));
      return false;
    }
    const [existing] = await tx.select({ id: users.id }).from(users).where(and(sql`lower(${users.recoveryEmail}) = ${current.email}`, sql`${users.recoveryEmailVerifiedAt} is not null`)).limit(1);
    if (existing && existing.id !== userId) throw new PasswordAuthError(409, "email_in_use", "این ایمیل به حساب دیگری متصل است");
    await tx.update(users).set({ recoveryEmail: current.email, recoveryEmailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "verify")));
    return true;
  });
}

export async function resetAccountPassword(userId: string, method: "email" | "recovery", value: string, password: string) {
  const db = getDb(), normalized = cleanCode(value);
  const [emailChallenge] = method === "email" ? await db.select().from(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "reset"), gt(accountEmailChallenges.expiresAt, new Date()))).limit(1) : [];
  const codes = method === "recovery" ? await db.select().from(accountRecoveryCodes).where(and(eq(accountRecoveryCodes.userId, userId), isNull(accountRecoveryCodes.usedAt))) : [];
  if (method === "email" && (!emailChallenge || emailChallenge.attempts >= 5)) throw genericRecoveryError();
  const matching = method === "recovery" ? (await Promise.all(codes.map(async row => await compare(normalized, row.codeHash) ? row.id : null))).find(Boolean) : null;
  const validEmail = emailChallenge ? await compare(value.trim(), emailChallenge.codeHash) : false;
  const nextHash = await hashPassword(password);
  const succeeded = await db.transaction(async tx => {
    const [account] = await tx.select({ id: users.id, recoveryEmail: users.recoveryEmail, recoveryEmailVerifiedAt: users.recoveryEmailVerifiedAt }).from(users).where(eq(users.id, userId)).for("update");
    if (!account) return false;
    if (method === "email") {
      const [current] = await tx.select().from(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "reset"))).for("update");
      if (!current || current.expiresAt <= new Date() || current.attempts >= 5 || current.codeHash !== emailChallenge?.codeHash || !validEmail || !account.recoveryEmailVerifiedAt || current.email !== account.recoveryEmail) {
        if (current && current.codeHash === emailChallenge?.codeHash) await tx.update(accountEmailChallenges).set({ attempts: sql`${accountEmailChallenges.attempts} + 1` }).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "reset")));
        return false;
      }
      await tx.delete(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "reset")));
    } else {
      if (!matching) return false;
      const [consumed] = await tx.update(accountRecoveryCodes).set({ usedAt: new Date() }).where(and(eq(accountRecoveryCodes.id, matching), isNull(accountRecoveryCodes.usedAt))).returning({ id: accountRecoveryCodes.id });
      if (!consumed) return false;
    }
    await tx.update(users).set({ passwordHash: nextHash, passwordUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accountEmailChallenges).where(and(eq(accountEmailChallenges.userId, userId), eq(accountEmailChallenges.purpose, "reset")));
    return true;
  });
  if (!succeeded) throw genericRecoveryError();
}
