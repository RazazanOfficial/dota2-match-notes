import { z } from "zod";
// Only implemented v1 endpoints belong here. Existing /api/* routes remain legacy.
export const API_VERSION = "v1" as const;
export const HealthSchema = z.object({
  ok: z.literal(true), service: z.literal("dota-notes-api"),
  apiVersion: z.literal(API_VERSION), status: z.literal("foundation"),
});
export type HealthResponse = z.infer<typeof HealthSchema>;
export const ApiErrorSchema = z.object({ ok: z.literal(false), error: z.string() });
export type Language = "en" | "fa";
export type ThemeName = "obsidian" | "radiant" | "nebula";
export type Appearance = "light" | "dark" | "system";
export interface Preferences { language: Language; theme: ThemeName; appearance: Appearance }
