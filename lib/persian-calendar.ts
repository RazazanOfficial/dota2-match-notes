import { addDays, getWeekAnchorDate, parseDateKey, toDateKey } from "./date";

const PERSIAN_PARTS = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});
const PERSIAN_MONTH_TITLE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});
const GREGORIAN_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

export const PERSIAN_WEEKDAYS = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
] as const;

type PersianDateParts = {
  year: number;
  month: number;
  day: number;
};

export type PersianCalendarDay = {
  key: string;
  persianDay: number;
  gregorianDay: number;
};

export type PersianCalendarMonth = {
  persianTitle: string;
  gregorianTitle: string;
  firstKey: string;
  lastKey: string;
  previousCursor: string;
  nextCursor: string;
  leadingBlankDays: number;
  days: PersianCalendarDay[];
};

function persianParts(date: Date): PersianDateParts {
  const values = Object.fromEntries(
    PERSIAN_PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function gregorianRangeTitle(first: Date, last: Date) {
  const firstMonth = GREGORIAN_MONTH.format(first);
  const lastMonth = GREGORIAN_MONTH.format(last);
  const firstYear = first.getUTCFullYear();
  const lastYear = last.getUTCFullYear();
  if (firstYear !== lastYear) return `${firstMonth} ${firstYear} – ${lastMonth} ${lastYear}`;
  if (firstMonth === lastMonth) return `${firstMonth} ${firstYear}`;
  return `${firstMonth} – ${lastMonth} ${lastYear}`;
}

export function buildPersianCalendarMonth(cursorKey: string): PersianCalendarMonth {
  const parsedCursor = parseDateKey(cursorKey);
  const cursor = Number.isNaN(parsedCursor.getTime()) ? new Date() : parsedCursor;
  const first = addDays(cursor, -(persianParts(cursor).day - 1));
  const month = persianParts(first).month;
  let next = addDays(first, 29);

  while (persianParts(next).month === month) next = addDays(next, 1);

  const last = addDays(next, -1);
  const length = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  return {
    persianTitle: PERSIAN_MONTH_TITLE.format(first),
    gregorianTitle: gregorianRangeTitle(first, last),
    firstKey: toDateKey(first),
    lastKey: toDateKey(last),
    previousCursor: toDateKey(addDays(first, -1)),
    nextCursor: toDateKey(next),
    leadingBlankDays: (first.getUTCDay() + 1) % 7,
    days: Array.from({ length }, (_, index) => {
      const date = addDays(first, index);
      return {
        key: toDateKey(date),
        persianDay: index + 1,
        gregorianDay: date.getUTCDate(),
      };
    }),
  };
}

export function selectedWeekRange(selectedDay: string, registrationDate: string, today: string) {
  const weekFrom = getWeekAnchorDate(selectedDay);
  const weekTo = toDateKey(addDays(parseDateKey(weekFrom), 6));
  return {
    from: weekFrom < registrationDate ? registrationDate : weekFrom,
    to: weekTo > today ? today : weekTo,
  };
}
