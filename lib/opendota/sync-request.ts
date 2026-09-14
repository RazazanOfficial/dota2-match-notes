import { z } from "zod";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function saturdayWeekStart(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
  return date.toISOString().slice(0, 10);
}

const dateKeySchema = z.string().regex(DATE_KEY_PATTERN).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاریخ نامعتبر است");

export const manualMatchSyncInputSchema = z.object({
  scope: z.enum(["day", "week"]),
  from: dateKeySchema,
  to: dateKeySchema,
  mode: z.enum(["basic", "analysis"]),
}).strict().superRefine((input, context) => {
  const from = new Date(`${input.from}T00:00:00.000Z`);
  const to = new Date(`${input.to}T00:00:00.000Z`);
  const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const invalidDay = input.scope === "day" && span !== 1;
  const invalidWeek = input.scope === "week" && (
    span < 1 || span > 7 || saturdayWeekStart(input.from) !== saturdayWeekStart(input.to)
  );
  if (invalidDay || invalidWeek) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: input.scope === "day" ? "بازه دریافت روزانه باید یک روز باشد" : "بازه هفتگی باید داخل یک هفته شنبه تا جمعه و حداکثر هفت روز باشد",
    });
  }
  const oldestAllowed = new Date();
  oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - 366);
  if (from < new Date(`${oldestAllowed.toISOString().slice(0, 10)}T00:00:00.000Z`)) {
    context.addIssue({ code: "custom", path: ["from"], message: "برای هر دریافت، حداکثر تا یک سال گذشته قابل انتخاب است" });
  }
});

export type ManualMatchSyncInput = z.infer<typeof manualMatchSyncInputSchema>;
