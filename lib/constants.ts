import type { MatchRole, QueueType } from "./types";

export const ANCHOR_DATE = "2026-07-25";
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
export const SESSION_COOKIE = "dota_notes_session";
export const SESSION_DAYS = 30;

export const ROLE_OPTIONS: Array<{ value: MatchRole; label: string }> = [
  { value: "safe_lane", label: "Safe Lane" },
  { value: "mid_lane", label: "Mid Lane" },
  { value: "off_lane", label: "Off Lane" },
  { value: "soft_support", label: "Soft Support" },
  { value: "hard_support", label: "Hard Support" },
];

export const QUEUE_OPTIONS: Array<{ value: QueueType; label: string }> = [
  { value: "role_selected", label: "Role Selected" },
  { value: "earn_role_queue", label: "Earn Role Queue" },
];

export const roleLabel = (value: string) =>
  ROLE_OPTIONS.find((option) => option.value === value)?.label || "—";

export const queueLabel = (value: string) =>
  QUEUE_OPTIONS.find((option) => option.value === value)?.label || "—";
