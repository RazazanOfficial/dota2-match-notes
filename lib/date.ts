import type { Day, Match, Profile, Summary } from "./types";
import { HEROES, heroById, heroByName } from "../data/heroes";

const PERSIAN_NUMBER = new Intl.NumberFormat("fa-IR");
const PERSIAN_PERCENT = new Intl.NumberFormat("fa-IR", {
  style: "percent",
  maximumFractionDigits: 0,
});
const PERSIAN_DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
const PERSIAN_DATE_SHORT = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
const PERSIAN_WEEKDAY = new Intl.DateTimeFormat("fa-IR", {
  weekday: "long",
  timeZone: "UTC",
});

export const faNumber = PERSIAN_NUMBER;
export const faPercent = PERSIAN_PERCENT;

export function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function getWeekDates(anchorDate: string, weekIndex: number) {
  const start = addDays(parseDateKey(anchorDate), weekIndex * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getCurrentWeekIndex(anchorDate: string) {
  const anchor = parseDateKey(anchorDate).getTime();
  const today = parseDateKey(toDateKey(new Date())).getTime();
  return Math.max(0, Math.floor((today - anchor) / 604_800_000));
}

export function getWeekLabel(index: number) {
  return `هفته ${PERSIAN_NUMBER.format(index + 1)}`;
}

export function formatWeekday(date: Date) {
  return PERSIAN_WEEKDAY.format(date);
}

export function formatDayDate(date: Date) {
  return PERSIAN_DATE_SHORT.format(date);
}

export function formatFullDate(date: Date) {
  return `${formatWeekday(date)}، ${PERSIAN_DATE.format(date)}`;
}

export function formatWeekRange(dates: Date[]) {
  return `${formatDayDate(dates[0])} تا ${PERSIAN_DATE.format(dates[6])}`;
}

export function summarizeMatches(matches: Match[] = []): Summary {
  const wins = matches.filter((match) => match.result === "win").length;
  const losses = matches.filter((match) => match.result === "loss").length;
  return {
    games: matches.length,
    wins,
    losses,
    winRate: matches.length ? wins / matches.length : 0,
  };
}

export function summarizeWeek(days: Record<string, Day>, dates: Date[]) {
  return summarizeMatches(dates.flatMap((date) => days[toDateKey(date)]?.matches || []));
}

export function normalizeUsername(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function normalizePublicHandle(value: string) {
  const normalized = normalizeUsername(value);
  return /^\d{1,10}$/.test(normalized) ? `steam_${normalized}` : normalized;
}

export function isValidUsername(value: string) {
  return /^[a-z0-9._-]{3,32}$/.test(value) &&
    !["__proto__", "prototype", "constructor"].includes(value);
}

export function newMatchId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function sanitizeMatch(raw: Record<string, unknown>, fallback = 1): Match {
  const legacyHero = String(raw.heroName || raw.hero || "").trim();
  const selectedHero =
    heroById(Number(raw.heroId)) || heroByName(legacyHero) || null;
  const rawBans = Array.isArray(raw.banIds)
    ? raw.banIds
    : Array.isArray(raw.bans)
      ? raw.bans
      : [];
  const bans = rawBans
    .map((item) => {
      if (typeof item === "number") return heroById(item);
      if (typeof item === "string") return heroByName(item);
      if (item && typeof item === "object") {
        const candidate = item as { id?: unknown; name?: unknown };
        return heroById(Number(candidate.id)) || heroByName(String(candidate.name || ""));
      }
      return null;
    })
    .filter((hero): hero is (typeof HEROES)[number] => Boolean(hero));
  const number = Number(raw.number);

  return {
    id: String(raw.id || newMatchId()),
    number: Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback,
    heroId: selectedHero?.id || null,
    heroName: selectedHero?.name || legacyHero,
    bans,
    legacyBans: typeof raw.bans === "string" ? raw.bans.trim() : String(raw.legacyBans || "").trim(),
    role: ["safe_lane", "mid_lane", "off_lane", "soft_support", "hard_support"].includes(
      String(raw.role),
    )
      ? (raw.role as Match["role"])
      : "",
    queueType: ["role_selected", "earn_role_queue"].includes(String(raw.queueType))
      ? (raw.queueType as Match["queueType"])
      : "",
    notes: String(raw.notes || "").trim(),
    result: raw.result === "win" ? "win" : "loss",
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

export function normalizeProfile(raw: unknown, username = ""): Profile {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const days: Record<string, Day> = {};
  const rawDays =
    source.days && typeof source.days === "object"
      ? (source.days as Record<string, Record<string, unknown>>)
      : {};

  Object.entries(rawDays).forEach(([dateKey, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !day) return;
    const matchSource = day.matches;
    const rawMatches = Array.isArray(matchSource)
      ? matchSource
      : matchSource && typeof matchSource === "object"
        ? Object.values(matchSource)
        : [];
    days[dateKey] = {
      completed: Boolean(day.completed),
      matches: rawMatches.map((match, index) =>
        sanitizeMatch(match as Record<string, unknown>, index + 1),
      ),
    };
  });

  return {
    username: String(source.username || username),
    createdAt: String(source.createdAt || ""),
    updatedAt: String(source.updatedAt || ""),
    days,
  };
}

export function mergeProfiles(current: Profile, incoming: Profile): Profile {
  return {
    username: incoming.username || current.username,
    createdAt: incoming.createdAt || current.createdAt,
    updatedAt: incoming.updatedAt || current.updatedAt,
    days: {
      ...current.days,
      ...incoming.days,
    },
  };
}
