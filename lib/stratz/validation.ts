import { z } from "zod";
import { StratzError } from "./errors";

const nullableInteger = z.number().int().nullable().optional();
const longValue = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]);

export const stratzDiagnosticsQuerySchema = z.object({
  matchIds: z
    .string()
    .trim()
    .regex(/^\d{1,16}(\s*,\s*\d{1,16}){0,2}$/)
    .transform((value) => value.split(",").map((item) => Number(item.trim())))
    .refine(
      (values) => values.every((value) => Number.isSafeInteger(value) && value > 0),
      "Invalid Match ID",
    )
    .transform((values) => [...new Set(values)]),
});

export const stratzPositionSchema = z.enum([
  "POSITION_1",
  "POSITION_2",
  "POSITION_3",
  "POSITION_4",
  "POSITION_5",
  "UNKNOWN",
  "FILTERED",
  "ALL",
]);

const stratzPlayerSchema = z.object({
  steamAccountId: longValue.nullable().optional(),
  playerSlot: nullableInteger,
  heroId: nullableInteger,
  position: stratzPositionSchema.nullable().optional(),
  role: z.string().nullable().optional(),
  roleBasic: z.string().nullable().optional(),
});

const stratzPickBanSchema = z.object({
  isPick: z.boolean().nullable().optional(),
  heroId: nullableInteger,
  order: nullableInteger,
  bannedHeroId: nullableInteger,
  isRadiant: z.boolean().nullable().optional(),
  playerIndex: nullableInteger,
  wasBannedSuccessfully: z.boolean().nullable().optional(),
  isCaptain: z.boolean().nullable().optional(),
});

const stratzMatchSchema = z.object({
  id: longValue,
  parsedDateTime: longValue.nullable().optional(),
  statsDateTime: longValue.nullable().optional(),
  players: z.array(stratzPlayerSchema).max(24).nullable().optional(),
  pickBans: z.array(stratzPickBanSchema).max(128).nullable().optional(),
});

const graphQlResponseSchema = z.object({
  data: z.record(z.string(), stratzMatchSchema.nullable()).nullable().optional(),
  errors: z
    .array(z.object({ message: z.string().max(1_000), path: z.array(z.unknown()).optional() }))
    .max(20)
    .optional(),
});

export function parseStratzResponse(input: unknown, matchIds: number[]) {
  const parsed = graphQlResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new StratzError(502, "invalid_stratz_response", "پاسخ STRATZ ساختار معتبر ندارد");
  }
  if (parsed.data.errors?.length) {
    throw new StratzError(502, "stratz_graphql_error", "STRATZ نتوانست فیلدهای تشخیصی را برگرداند");
  }
  const data = parsed.data.data || {};
  return matchIds.map((matchId, index) => {
    const match = data[`match${index}`] || null;
    if (match && match.id !== matchId) {
      throw new StratzError(502, "stratz_match_mismatch", "شناسه پاسخ STRATZ با درخواست هماهنگ نیست");
    }
    return { matchId, match };
  });
}

export type StratzMatch = z.infer<typeof stratzMatchSchema>;
export type StratzPosition = z.infer<typeof stratzPositionSchema>;
