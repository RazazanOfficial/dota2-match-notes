import { z } from "zod";
import { heroById } from "../../data/heroes";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;
const STEAM_ID_BASE = 76_561_197_960_265_728n;
const MAX_STEAM_ACCOUNT_ID = 4_294_967_295n;
const reviewPoints = z
  .array(z.string().trim().min(1).max(240))
  .max(20)
  .refine((points) => new Set(points).size === points.length, "مورد تکراری است");

const dateKeySchema = z
  .string()
  .regex(DATE_KEY_PATTERN)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "تاریخ نامعتبر است");

const matchSchema = z
  .object({
    id: z.string().uuid(),
    number: z.number().int().min(1).max(32_767),
    heroId: z.number().int().positive().nullable(),
    heroName: z.string().trim().min(1).max(100),
    banIds: z
      .array(z.number().int().positive())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, "بن تکراری است")
      .refine((ids) => ids.every((id) => Boolean(heroById(id))), "هیروی بن‌شده نامعتبر است"),
    legacyBans: z.string().max(500).optional().default(""),
    role: z.union([
      z.literal(""),
      z.enum([
        "safe_lane",
        "mid_lane",
        "off_lane",
        "soft_support",
        "hard_support",
      ]),
    ]),
    queueType: z.union([
      z.literal(""),
      z.enum(["role_selected", "earn_role_queue"]),
    ]),
    notes: z.string().max(5_000),
    positivePoints: reviewPoints.default([]),
    negativePoints: reviewPoints.default([]),
    result: z.enum(["win", "loss"]),
    createdAt: z
      .string()
      .max(64)
      .refine((value) => !Number.isNaN(Date.parse(value)), "زمان ساخت نامعتبر است"),
  })
  .strict()
  .superRefine((match, context) => {
    if (match.heroId !== null && !heroById(match.heroId)) {
      context.addIssue({
        code: "custom",
        path: ["heroId"],
        message: "هیرو نامعتبر است",
      });
    }
  });

export const dayInputSchema = z
  .object({
    completed: z.boolean(),
    matches: z.record(z.string(), matchSchema),
  })
  .strict()
  .superRefine((day, context) => {
    const entries = Object.entries(day.matches);

    if (entries.length > 50) {
      context.addIssue({
        code: "custom",
        path: ["matches"],
        message: "تعداد بازی‌های یک روز بیش از حد مجاز است",
      });
    }

    const numbers = entries.map(([, match]) => match.number);
    if (new Set(numbers).size !== numbers.length) {
      context.addIssue({
        code: "custom",
        path: ["matches"],
        message: "شماره بازی در یک روز نمی‌تواند تکراری باشد",
      });
    }

    entries.forEach(([key, match]) => {
      if (key !== match.id) {
        context.addIssue({
          code: "custom",
          path: ["matches", key, "id"],
          message: "شناسه بازی با کلید آن هماهنگ نیست",
        });
      }
    });
  });

export type DayInput = z.infer<typeof dayInputSchema>;

export function parseDateKey(value: string) {
  return dateKeySchema.safeParse(value);
}

export function parseDateRange(searchParams: URLSearchParams) {
  const fromResult = dateKeySchema.safeParse(searchParams.get("from"));
  const toResult = dateKeySchema.safeParse(searchParams.get("to"));

  if (!fromResult.success || !toResult.success) {
    return { success: false as const, error: "پارامترهای from و to معتبر نیستند" };
  }

  const fromTime = Date.parse(`${fromResult.data}T00:00:00.000Z`);
  const toTime = Date.parse(`${toResult.data}T00:00:00.000Z`);
  const rangeDays = Math.floor((toTime - fromTime) / 86_400_000) + 1;

  if (rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
    return {
      success: false as const,
      error: `بازه گزارش باید بین ۱ تا ${MAX_RANGE_DAYS} روز باشد`,
    };
  }

  return {
    success: true as const,
    data: { from: fromResult.data, to: toResult.data },
  };
}

export function parseHandle(value: string) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  const handle = /^\d{1,10}$/.test(normalized)
    ? `steam_${normalized}`
    : normalized;
  return /^[a-z0-9._-]{3,32}$/.test(handle) ? handle : null;
}

export type PublicPlayerIdentifier =
  | { kind: "steam_id"; value: string }
  | { kind: "account_id"; value: number }
  | { kind: "handle"; value: string };

export function parsePublicPlayerIdentifier(
  value: string,
): PublicPlayerIdentifier | null {
  const normalized = value.normalize("NFKC").trim().toLowerCase();

  if (/^\d{17}$/.test(normalized)) {
    const steamId = BigInt(normalized);
    const accountId = steamId - STEAM_ID_BASE;
    if (accountId >= 0n && accountId <= MAX_STEAM_ACCOUNT_ID) {
      return { kind: "steam_id", value: normalized };
    }
    return null;
  }

  if (/^\d{1,10}$/.test(normalized)) {
    const accountId = BigInt(normalized);
    if (accountId <= MAX_STEAM_ACCOUNT_ID) {
      return { kind: "account_id", value: Number(accountId) };
    }
    return null;
  }

  if (
    /^[a-z0-9._-]{3,32}$/.test(normalized) &&
    !["__proto__", "prototype", "constructor"].includes(normalized)
  ) {
    return { kind: "handle", value: normalized };
  }

  return null;
}
