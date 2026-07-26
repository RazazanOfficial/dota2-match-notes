(function attachCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.DotaNotesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore() {
  "use strict";

  const PERSIAN_NUMBER = new Intl.NumberFormat("fa-IR");
  const PERSIAN_PERCENT = new Intl.NumberFormat("fa-IR", {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const PERSIAN_DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const PERSIAN_DATE_SHORT = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    month: "long",
    day: "numeric",
  });
  const PERSIAN_WEEKDAY = new Intl.DateTimeFormat("fa-IR", {
    weekday: "long",
  });
  const STEAM_ID_PATTERN = /^7656119\d{10}$/;

  function toEnglishDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
      .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
  }

  function normalizeSteamId(value) {
    return toEnglishDigits(value).replace(/\s+/g, "").trim();
  }

  function isValidSteamId(value) {
    return STEAM_ID_PATTERN.test(normalizeSteamId(value));
  }

  function parseDateKey(dateKey) {
    const [year, month, day] = String(dateKey).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(dateOrKey, amount) {
    const date =
      typeof dateOrKey === "string" ? parseDateKey(dateOrKey) : new Date(dateOrKey.getTime());
    date.setDate(date.getDate() + amount);
    return date;
  }

  function getWeekDates(anchorDateKey, weekIndex) {
    const weekStart = addDays(anchorDateKey, weekIndex * 7);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }

  function getWeekIndex(anchorDateKey, date = new Date()) {
    const anchor = parseDateKey(anchorDateKey);
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    return Math.max(0, Math.floor((localDate - anchor) / 86400000 / 7));
  }

  function toOrdinal(value) {
    const common = {
      1: "اول",
      2: "دوم",
      3: "سوم",
      4: "چهارم",
      5: "پنجم",
      6: "ششم",
      7: "هفتم",
      8: "هشتم",
      9: "نهم",
      10: "دهم",
      11: "یازدهم",
      12: "دوازدهم",
      13: "سیزدهم",
      14: "چهاردهم",
      15: "پانزدهم",
      16: "شانزدهم",
      17: "هفدهم",
      18: "هجدهم",
      19: "نوزدهم",
      20: "بیستم",
    };
    return common[value] || `${PERSIAN_NUMBER.format(value)}‌ام`;
  }

  function getWeekLabel(weekIndex) {
    return `هفته ${toOrdinal(weekIndex + 1)}`;
  }

  function formatWeekRange(dates) {
    const firstParts = getPersianDateParts(dates[0]);
    const lastParts = getPersianDateParts(dates[dates.length - 1]);

    if (firstParts.year === lastParts.year && firstParts.month === lastParts.month) {
      return `${firstParts.day} تا ${lastParts.day} ${firstParts.month} ${firstParts.year}`;
    }

    if (firstParts.year === lastParts.year) {
      return `${firstParts.day} ${firstParts.month} تا ${lastParts.day} ${lastParts.month} ${firstParts.year}`;
    }

    return `${PERSIAN_DATE_SHORT.format(dates[0])} ${firstParts.year} تا ${PERSIAN_DATE_SHORT.format(dates[6])} ${lastParts.year}`;
  }

  function getPersianDateParts(date) {
    const parts = PERSIAN_DATE.formatToParts(date);
    return Object.fromEntries(
      parts
        .filter((part) => ["year", "month", "day"].includes(part.type))
        .map((part) => [part.type, part.value]),
    );
  }

  function formatFullDate(date) {
    return `${PERSIAN_WEEKDAY.format(date)}، ${PERSIAN_DATE.format(date)}`;
  }

  function formatDayDate(date) {
    return PERSIAN_DATE_SHORT.format(date);
  }

  function formatWeekday(date) {
    return PERSIAN_WEEKDAY.format(date);
  }

  function summarizeMatches(matches = []) {
    const wins = matches.filter((match) => match.result === "win").length;
    const losses = matches.filter((match) => match.result === "loss").length;
    const games = matches.length;

    return {
      games,
      wins,
      losses,
      winRate: games ? wins / games : 0,
    };
  }

  function summarizeWeek(days, dates) {
    const matches = dates.flatMap((date) => days[toDateKey(date)]?.matches || []);
    return summarizeMatches(matches);
  }

  function sanitizeMatch(match, fallbackNumber = 1) {
    const result = match?.result === "win" ? "win" : "loss";
    const number = Number(toEnglishDigits(match?.number ?? fallbackNumber));

    return {
      id: String(match?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      number: Number.isFinite(number) && number > 0 ? Math.floor(number) : fallbackNumber,
      hero: String(match?.hero || "").trim(),
      bans: String(match?.bans || "").trim(),
      notes: String(match?.notes || "").trim(),
      result,
      createdAt: String(match?.createdAt || new Date().toISOString()),
    };
  }

  function normalizeState(rawState, anchorDateKey) {
    const state = {
      version: 1,
      anchorDate: anchorDateKey,
      activeWeek: 0,
      days: {},
    };

    if (!rawState || typeof rawState !== "object") {
      return state;
    }

    const parsedWeek = Number(rawState.activeWeek);
    state.activeWeek = Number.isFinite(parsedWeek) ? Math.max(0, Math.floor(parsedWeek)) : 0;

    if (rawState.days && typeof rawState.days === "object") {
      Object.entries(rawState.days).forEach(([dateKey, day]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !day || typeof day !== "object") {
          return;
        }

        const rawMatches = Array.isArray(day.matches)
          ? day.matches
          : day.matches && typeof day.matches === "object"
            ? Object.values(day.matches)
            : [];
        const matches = rawMatches.map((match, index) => sanitizeMatch(match, index + 1));

        state.days[dateKey] = {
          completed: Boolean(day.completed),
          matches,
        };
      });
    }

    return state;
  }

  function serializeDay(day) {
    const matches = Object.fromEntries(
      (day.matches || []).map((match, index) => {
        const safeMatch = sanitizeMatch(match, index + 1);
        return [
          safeMatch.id,
          {
            ...safeMatch,
            updatedAt: Date.now(),
          },
        ];
      }),
    );

    return {
      completed: Boolean(day.completed),
      matches,
    };
  }

  function buildWeekReport(state, weekIndex) {
    const dates = getWeekDates(state.anchorDate, weekIndex);
    const weekSummary = summarizeWeek(state.days, dates);
    const lines = [
      `گزارش ${getWeekLabel(weekIndex)}`,
      formatWeekRange(dates),
      "",
      `مجموع: ${PERSIAN_NUMBER.format(weekSummary.games)} بازی | ${PERSIAN_NUMBER.format(weekSummary.wins)} برد | ${PERSIAN_NUMBER.format(weekSummary.losses)} باخت | نرخ برد ${PERSIAN_PERCENT.format(weekSummary.winRate)}`,
    ];

    dates.forEach((date) => {
      const dateKey = toDateKey(date);
      const day = state.days[dateKey] || { completed: false, matches: [] };
      const summary = summarizeMatches(day.matches);

      lines.push("", `— ${formatFullDate(date)}`);

      if (!day.matches.length) {
        lines.push("بدون بازی");
        return;
      }

      day.matches
        .slice()
        .sort((a, b) => a.number - b.number)
        .forEach((match) => {
          lines.push(
            "",
            `بازی ${PERSIAN_NUMBER.format(match.number)} | ${match.result === "win" ? "برد" : "باخت"}`,
            `هیرو: ${match.hero || "—"}`,
            `بن‌ها: ${match.bans || "—"}`,
            `یادداشت: ${match.notes || "—"}`,
          );
        });

      lines.push(
        "",
        `جمع روز: ${PERSIAN_NUMBER.format(summary.wins)} برد، ${PERSIAN_NUMBER.format(summary.losses)} باخت، نرخ برد ${PERSIAN_PERCENT.format(summary.winRate)}`,
      );
    });

    return lines.join("\n");
  }

  return {
    addDays,
    buildWeekReport,
    formatDayDate,
    formatFullDate,
    formatWeekRange,
    formatWeekday,
    getWeekDates,
    getWeekIndex,
    getWeekLabel,
    isValidSteamId,
    normalizeSteamId,
    normalizeState,
    parseDateKey,
    sanitizeMatch,
    serializeDay,
    summarizeMatches,
    summarizeWeek,
    toDateKey,
    toEnglishDigits,
  };
});
