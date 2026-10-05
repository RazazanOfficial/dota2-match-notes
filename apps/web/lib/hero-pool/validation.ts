import { z } from "zod";
import { heroById } from "@/data/heroes";
import { HERO_POOL_ROLES } from "./rules";

const heroIds = z
  .array(z.number().int().positive())
  .min(2, "برای هر رول دست‌کم دو هیرو انتخاب کنید")
  .max(8, "Hero Pool هر رول حداکثر هشت هیرو است")
  .refine((ids) => new Set(ids).size === ids.length, "هیروی تکراری در یک رول مجاز نیست")
  .refine((ids) => ids.every((id) => Boolean(heroById(id))), "Hero Pool شامل هیروی نامعتبر است");

export const heroPoolInputSchema = z
  .object(Object.fromEntries(HERO_POOL_ROLES.map((role) => [role, heroIds])) as Record<(typeof HERO_POOL_ROLES)[number], typeof heroIds>)
  .strict();

export type HeroPoolInput = z.infer<typeof heroPoolInputSchema>;

