import { z } from "zod";
import { OpenDotaError } from "./errors";

const MAX_DOTA_ID = Number.MAX_SAFE_INTEGER;
const nullableStat = (max: number) =>
  z.number().int().min(0).max(max).nullable().optional();

const openDotaPlayerSchema = z
  .object({
    account_id: z.number().int().min(0).max(4_294_967_295).nullable().optional(),
    personaname: z.string().trim().max(100).nullable().optional(),
    player_slot: z.number().int().min(0).max(255),
    hero_id: z.number().int().positive(),
    level: nullableStat(100),
    kills: nullableStat(32_767),
    deaths: nullableStat(32_767),
    assists: nullableStat(32_767),
    last_hits: nullableStat(32_767),
    denies: nullableStat(32_767),
    gold_per_min: nullableStat(32_767),
    xp_per_min: nullableStat(32_767),
    net_worth: nullableStat(2_147_483_647),
    hero_damage: nullableStat(2_147_483_647),
    tower_damage: nullableStat(2_147_483_647),
    lane: z.number().int().min(0).max(5).nullable().optional(),
    lane_role: z.number().int().min(0).max(5).nullable().optional(),
    is_roaming: z.boolean().nullable().optional(),
  })
  .passthrough();

const openDotaRecentMatchSchema = z
  .object({
    match_id: z.number().int().positive().max(MAX_DOTA_ID),
    player_slot: z.number().int().min(0).max(255),
    radiant_win: z.boolean(),
    radiant_score: nullableStat(32_767),
    dire_score: nullableStat(32_767),
    duration: z.number().int().min(0).max(24 * 60 * 60),
    game_mode: z.number().int().min(0).nullable().optional(),
    lobby_type: z.number().int().min(0).nullable().optional(),
    hero_id: z.number().int().positive(),
    start_time: z.number().int().min(0),
    kills: nullableStat(32_767),
    deaths: nullableStat(32_767),
    assists: nullableStat(32_767),
    gold_per_min: nullableStat(32_767),
    xp_per_min: nullableStat(32_767),
    net_worth: nullableStat(2_147_483_647),
    hero_damage: nullableStat(2_147_483_647),
    tower_damage: nullableStat(2_147_483_647),
  })
  .passthrough();

const openDotaRecentMatchesSchema = z
  .array(openDotaRecentMatchSchema)
  .max(1_000);

export const openDotaMatchSchema = z
  .object({
    match_id: z.number().int().positive().max(MAX_DOTA_ID),
    start_time: z.number().int().min(0),
    duration: z.number().int().min(0).max(24 * 60 * 60),
    radiant_win: z.boolean(),
    radiant_score: nullableStat(32_767),
    dire_score: nullableStat(32_767),
    game_mode: z.number().int().min(0).nullable().optional(),
    lobby_type: z.number().int().min(0).nullable().optional(),
    players: z.array(openDotaPlayerSchema).min(1).max(24),
    picks_bans: z
      .array(
        z.object({
          is_pick: z.boolean(),
          hero_id: z.number().int().positive(),
          team: z.number().int().min(0).max(3),
          order: z.number().int().min(0).max(255).nullable().optional(),
        }).passthrough(),
      )
      .max(64)
      .nullable()
      .optional(),
  })
  .passthrough();

const dotaMatchIdSchema = z
  .union([
    z.number().int().positive().max(MAX_DOTA_ID),
    z.string().trim().regex(/^\d{1,16}$/).transform(Number),
  ])
  .refine(Number.isSafeInteger, "شناسه مچ معتبر نیست");

export const openDotaSyncInputSchema = z
  .object({
    dotaMatchId: dotaMatchIdSchema,
  })
  .strict();

export function parseJournalMatchId(value: string) {
  return z.string().uuid().safeParse(value);
}

export function parseOpenDotaMatch(input: unknown, expectedMatchId: number) {
  const result = openDotaMatchSchema.safeParse(input);
  if (!result.success) {
    throw new OpenDotaError(
      502,
      "invalid_opendota_response",
      "پاسخ OpenDota ساختار معتبر ندارد",
    );
  }
  if (result.data.match_id !== expectedMatchId) {
    throw new OpenDotaError(
      502,
      "opendota_match_mismatch",
      "شناسه پاسخ OpenDota با مچ درخواستی هماهنگ نیست",
    );
  }
  return result.data;
}

export function parseOpenDotaRecentMatches(input: unknown) {
  const result = openDotaRecentMatchesSchema.safeParse(input);
  if (!result.success) {
    throw new OpenDotaError(
      502,
      "invalid_opendota_response",
      "فهرست مچ‌های OpenDota ساختار معتبر ندارد",
    );
  }

  const unique = new Map<number, z.infer<typeof openDotaRecentMatchSchema>>();
  for (const match of result.data) unique.set(match.match_id, match);
  return [...unique.values()].sort((left, right) => right.start_time - left.start_time);
}

export type OpenDotaMatch = z.infer<typeof openDotaMatchSchema>;
export type OpenDotaPlayer = z.infer<typeof openDotaPlayerSchema>;
export type OpenDotaRecentMatch = z.infer<typeof openDotaRecentMatchSchema>;
