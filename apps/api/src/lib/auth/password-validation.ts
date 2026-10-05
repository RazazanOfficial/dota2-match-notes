import { z } from "zod";
import { steamAccountIdToSteamId, steamIdToAccountId } from "./steam";

const passwordSchema = z
  .string()
  .min(8, "رمز عبور باید حداقل ۸ نویسه باشد")
  .max(72, "رمز عبور نمی‌تواند بیشتر از ۷۲ نویسه باشد")
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "رمز عبور نمی‌تواند بیشتر از ۷۲ بایت باشد");

export function normalizePasswordSteamIdentifier(value: string) {
  const normalized = value.normalize("NFKC").trim();
  if (/^\d{17}$/.test(normalized)) {
    steamIdToAccountId(normalized);
    return normalized;
  }
  if (/^\d{1,10}$/.test(normalized)) {
    return steamAccountIdToSteamId(normalized);
  }
  throw new Error("invalid_steam_id");
}

const steamIdentifierSchema = z
  .string()
  .trim()
  .min(1, "Steam ID را وارد کنید")
  .max(20)
  .transform((value, context) => {
    try {
      return normalizePasswordSteamIdentifier(value);
    } catch {
      context.addIssue({ code: "custom", message: "Steam ID معتبر نیست" });
      return z.NEVER;
    }
  });

export const passwordLoginSchema = z
  .object({
    steamIdentifier: steamIdentifierSchema,
    // Registration accepts six characters when the other strength rules pass.
    password: z.string().min(6).max(72),
  })
  .strict();

export const passwordChangeSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "تکرار رمز عبور یکسان نیست",
  });
