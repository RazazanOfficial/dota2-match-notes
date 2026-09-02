import type { Day, Match, MatchParticipant, MatchPick, Profile, Summary } from "./types";
import { HEROES, heroById, heroByName } from "../data/heroes";
import { gameModeName, lobbyTypeName } from "./dota/modes";

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

export function getWeekAnchorDate(value: string | Date) {
  const source = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(source.getTime())) return toDateKey(new Date());
  const date = parseDateKey(toDateKey(source));
  const daysSinceSaturday = (date.getUTCDay() + 1) % 7;
  return toDateKey(addDays(date, -daysSinceSaturday));
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

export function normalizePublicPlayerIdentifier(value: string) {
  return normalizeUsername(value);
}

export function isValidPublicPlayerIdentifier(value: string) {
  return /^\d{1,17}$/.test(value) || isValidUsername(value);
}

export function isValidUsername(value: string) {
  return /^[a-z0-9._-]{3,32}$/.test(value) &&
    !["__proto__", "prototype", "constructor"].includes(value);
}

export function newMatchId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const date = String(value);
  return Number.isNaN(Date.parse(date)) ? null : date;
}

function nullableMatchId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const matchId = String(value);
  return /^\d{1,16}$/.test(matchId) ? matchId : null;
}

function nonNegativeInteger(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  const number = nullableNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 && number <= max
    ? number
    : null;
}

function sanitizeItemList(value: unknown, length: number) {
  const items = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => {
    const itemId = nonNegativeInteger(items[index], 100_000);
    return itemId && itemId > 0 ? itemId : null;
  });
}

function sanitizeParticipant(value: unknown): MatchParticipant | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const playerSlot = nonNegativeInteger(candidate.playerSlot, 255);
  const standardSlot = playerSlot !== null && (
    (playerSlot >= 0 && playerSlot <= 4) ||
    (playerSlot >= 128 && playerSlot <= 132)
  );
  const hero = heroById(Number(candidate.heroId)) || heroByName(String(candidate.heroName || ""));
  if (!standardSlot || !hero || playerSlot === null) return null;

  const personName = String(candidate.personName || "").trim().slice(0, 100);
  const accountId = nonNegativeInteger(candidate.accountId, 4_294_967_295);

  return {
    playerSlot,
    accountId: accountId && accountId > 0 ? accountId : null,
    personName: personName === "بازیکن ناشناس" || !personName ? "حساب خصوصی" : personName,
    heroId: hero.id,
    heroName: hero.name,
    team: playerSlot < 128 ? "radiant" : "dire",
    level: nonNegativeInteger(candidate.level, 100),
    kills: nonNegativeInteger(candidate.kills, 32_767),
    deaths: nonNegativeInteger(candidate.deaths, 32_767),
    assists: nonNegativeInteger(candidate.assists, 32_767),
    lastHits: nonNegativeInteger(candidate.lastHits, 32_767),
    denies: nonNegativeInteger(candidate.denies, 32_767),
    goldPerMinute: nonNegativeInteger(candidate.goldPerMinute, 32_767),
    xpPerMinute: nonNegativeInteger(candidate.xpPerMinute, 32_767),
    netWorth: nonNegativeInteger(candidate.netWorth, 2_147_483_647),
    heroDamage: nonNegativeInteger(candidate.heroDamage, 2_147_483_647),
    towerDamage: nonNegativeInteger(candidate.towerDamage, 2_147_483_647),
    heroHealing: nonNegativeInteger(candidate.heroHealing, 2_147_483_647),
    itemIds: sanitizeItemList(candidate.itemIds, 6),
    backpackItemIds: sanitizeItemList(candidate.backpackItemIds, 3),
    neutralItemId: nonNegativeInteger(candidate.neutralItemId, 100_000) || null,
    neutralEnhancementId:
      nonNegativeInteger(candidate.neutralEnhancementId, 100_000) || null,
    hasAghanimsScepter: Boolean(candidate.hasAghanimsScepter),
    hasAghanimsShard: Boolean(candidate.hasAghanimsShard),
    isProfilePlayer: Boolean(candidate.isProfilePlayer),
    inRolePool: Boolean(candidate.inRolePool),
  };
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
        const candidate = item as {
          id?: unknown;
          name?: unknown;
          source?: unknown;
          team?: unknown;
          draftOrder?: unknown;
          inRolePool?: unknown;
        };
        const hero = heroById(Number(candidate.id)) || heroByName(String(candidate.name || ""));
        if (!hero) return null;
        return {
          ...hero,
          source:
            candidate.source === "stratz"
              ? "stratz" as const
              : candidate.source === "opendota"
                ? "opendota" as const
                : "manual" as const,
          team: nullableNumber(candidate.team),
          draftOrder: nullableNumber(candidate.draftOrder),
          inRolePool: Boolean(candidate.inRolePool),
        };
      }
      return null;
    })
    .filter((hero): hero is (typeof HEROES)[number] => Boolean(hero));
  const rawPicks = Array.isArray(raw.picks) ? raw.picks : [];
  const picks = rawPicks
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as {
        id?: unknown;
        name?: unknown;
        playerSlot?: unknown;
        team?: unknown;
        inRolePool?: unknown;
      };
      const hero = heroById(Number(candidate.id)) || heroByName(String(candidate.name || ""));
      if (!hero) return null;
      return {
        ...hero,
        playerSlot: nullableNumber(candidate.playerSlot),
        team: nullableNumber(candidate.team),
        inRolePool: Boolean(candidate.inRolePool),
      };
    })
    .filter((hero): hero is NonNullable<typeof hero> => hero !== null)
    .slice(0, 9) satisfies MatchPick[];
  const number = Number(raw.number);
  const gameModeId = nullableNumber(raw.gameModeId);
  const lobbyTypeId = nullableNumber(raw.lobbyTypeId);
  const source = ["manual", "steam", "opendota"].includes(String(raw.source))
    ? (raw.source as Match["source"])
    : "manual";
  const rawPositionOverrides = raw.positionOverrides && typeof raw.positionOverrides === "object" && !Array.isArray(raw.positionOverrides)
    ? raw.positionOverrides as Record<string, unknown>
    : {};
  const positionOverrides = Object.fromEntries(
    Object.entries(rawPositionOverrides).flatMap(([slot, value]) =>
      /^(?:[0-4]|12[89]|13[0-2])$/.test(slot) && Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5
        ? [[slot, Number(value)]]
        : [],
    ),
  );

  return {
    id: String(raw.id || newMatchId()),
    number: Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback,
    heroId: selectedHero?.id || null,
    heroName: selectedHero?.name || legacyHero,
    bans,
    picks,
    legacyBans: typeof raw.bans === "string" ? raw.bans.trim() : String(raw.legacyBans || "").trim(),
    role: ["safe_lane", "mid_lane", "off_lane", "soft_support", "hard_support"].includes(
      String(raw.role),
    )
      ? (raw.role as Match["role"])
      : "",
    roleSource: ["manual", "opendota", "stratz"].includes(String(raw.roleSource))
      ? (raw.roleSource as Match["roleSource"])
      : null,
    positionOverrides,
    heroPoolEligible: Boolean(raw.heroPoolEligible),
    heroPoolMatch: typeof raw.heroPoolMatch === "boolean" ? raw.heroPoolMatch : null,
    heroPoolVersion: nullableNumber(raw.heroPoolVersion),
    queueType: ["role_selected", "earn_role_queue"].includes(String(raw.queueType))
      ? (raw.queueType as Match["queueType"])
      : "",
    notes: String(raw.notes || "").trim(),
    positivePoints: Array.isArray(raw.positivePoints)
      ? raw.positivePoints.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : [],
    negativePoints: Array.isArray(raw.negativePoints)
      ? raw.negativePoints.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : [],
    result: raw.result === "win" ? "win" : "loss",
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: nullableDate(raw.updatedAt) || undefined,
    source,
    dotaMatchId: nullableMatchId(raw.dotaMatchId),
    startedAt: nullableDate(raw.startedAt),
    durationSeconds: nullableNumber(raw.durationSeconds),
    kills: nullableNumber(raw.kills),
    deaths: nullableNumber(raw.deaths),
    assists: nullableNumber(raw.assists),
    goldPerMinute: nullableNumber(raw.goldPerMinute),
    xpPerMinute: nullableNumber(raw.xpPerMinute),
    netWorth: nullableNumber(raw.netWorth),
    heroDamage: nullableNumber(raw.heroDamage),
    towerDamage: nullableNumber(raw.towerDamage),
    gameModeId,
    gameModeName:
      typeof raw.gameModeName === "string"
        ? raw.gameModeName
        : gameModeName(gameModeId),
    lobbyTypeId,
    lobbyTypeName:
      typeof raw.lobbyTypeName === "string"
        ? raw.lobbyTypeName
        : lobbyTypeName(lobbyTypeId),
    radiantWin: typeof raw.radiantWin === "boolean" ? raw.radiantWin : null,
    radiantScore: nonNegativeInteger(raw.radiantScore, 32_767),
    direScore: nonNegativeInteger(raw.direScore, 32_767),
    participants: Array.isArray(raw.participants)
      ? raw.participants
          .map(sanitizeParticipant)
          .filter((participant): participant is MatchParticipant => participant !== null)
          .sort((left, right) => left.playerSlot - right.playerSlot)
          .slice(0, 10)
      : [],
    images: Array.isArray(raw.images)
      ? raw.images
          .filter((image): image is Record<string, unknown> =>
            Boolean(image && typeof image === "object"),
          )
          .map((image) => ({
            id: String(image.id || ""),
            publicUrl: String(image.publicUrl || ""),
            altText: String(image.altText || ""),
            width: nullableNumber(image.width),
            height: nullableNumber(image.height),
            sortOrder: nullableNumber(image.sortOrder) || 1,
          }))
          .filter((image) => image.id && /^https:\/\//.test(image.publicUrl))
      : [],
    imageJobStatus: ["pending", "processing", "completed", "failed"].includes(
      String(raw.imageJobStatus),
    )
      ? (raw.imageJobStatus as Match["imageJobStatus"])
      : null,
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
    registeredDate: /^\d{4}-\d{2}-\d{2}$/.test(String(source.registeredDate || ""))
      ? String(source.registeredDate)
      : undefined,
    createdAt: String(source.createdAt || ""),
    updatedAt: String(source.updatedAt || ""),
    days,
  };
}

export function mergeProfiles(current: Profile, incoming: Profile): Profile {
  return {
    username: incoming.username || current.username,
    registeredDate: incoming.registeredDate || current.registeredDate,
    createdAt: incoming.createdAt || current.createdAt,
    updatedAt: incoming.updatedAt || current.updatedAt,
    days: {
      ...current.days,
      ...incoming.days,
    },
  };
}
