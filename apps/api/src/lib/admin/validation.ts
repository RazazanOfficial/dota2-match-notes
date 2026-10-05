import { z } from "zod";
import {
  steamAccountIdToSteamId,
  steamIdToAccountId,
} from "../auth/steam";

export function normalizeSteamIdentifier(value: string) {
  const normalized = value.normalize("NFKC").trim();

  if (/^\d{17}$/.test(normalized)) {
    return {
      steamId: normalized,
      steamAccountId: steamIdToAccountId(normalized),
    };
  }

  if (/^\d{1,10}$/.test(normalized)) {
    const steamId = steamAccountIdToSteamId(normalized);
    return {
      steamId,
      steamAccountId: steamIdToAccountId(steamId),
    };
  }

  throw new Error("Steam identifier is invalid");
}

export const provisionUserInputSchema = z
  .object({
    steamIdentifier: z.string().trim().min(1).max(20),
  })
  .strict()
  .transform((input, context) => {
    try {
      return normalizeSteamIdentifier(input.steamIdentifier);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["steamIdentifier"],
        message: "Steam ID نامعتبر است",
      });
      return z.NEVER;
    }
  });

export const listUsersQuerySchema = z.object({
  query: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const overviewQuerySchema = z.object({
  range: z.coerce.number().int().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30),
});

export const reprocessMatchesSchema = z.object({
  count: z.coerce.number().int().min(1).max(20),
}).strict();
