import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { desktopAuthCodes } from "../db/schema";
import { DESKTOP_AUTH_CODE_DURATION_SECONDS } from "./config";

const base64url43 = /^[A-Za-z0-9_-]{43}$/;
const verifierPattern = /^[A-Za-z0-9_-]{43,128}$/;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function isDesktopChallenge(value: string | null): value is string {
  return !!value && base64url43.test(value);
}

export function isDesktopNonce(value: string | null): value is string {
  return !!value && base64url43.test(value);
}

export function parseDesktopState(value: string | undefined) {
  if (!value) return null;
  const pieces = value.split(".");
  if (pieces.length !== 3 || !base64url43.test(pieces[0]) ||
      !isDesktopChallenge(pieces[1]) || !isDesktopNonce(pieces[2])) return null;
  return { state: pieces[0], challenge: pieces[1], nonce: pieces[2] };
}

export async function createDesktopAuthCode(userId: string, challenge: string) {
  const code = randomBytes(32).toString("base64url");
  await getDb().insert(desktopAuthCodes).values({
    codeHash: hash(code), userId, challenge,
    expiresAt: new Date(Date.now() + DESKTOP_AUTH_CODE_DURATION_SECONDS * 1_000),
  });
  return code;
}

export async function consumeDesktopAuthCode(code: string, verifier: string) {
  if (!base64url43.test(code) || !verifierPattern.test(verifier)) return null;
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const [grant] = await getDb().delete(desktopAuthCodes).where(and(
    eq(desktopAuthCodes.codeHash, hash(code)),
    eq(desktopAuthCodes.challenge, challenge),
    gt(desktopAuthCodes.expiresAt, new Date()),
  )).returning({ userId: desktopAuthCodes.userId });
  return grant?.userId || null;
}
