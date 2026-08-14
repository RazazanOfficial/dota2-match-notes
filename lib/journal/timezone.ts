const DEFAULT_JOURNAL_TIME_ZONE = "Asia/Tehran";

export function getJournalTimeZone() {
  const timeZone =
    process.env.JOURNAL_TIME_ZONE?.trim() || DEFAULT_JOURNAL_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
  } catch {
    throw new Error("Invalid env: JOURNAL_TIME_ZONE");
  }
  return timeZone;
}

export function toJournalDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid journal date");
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: getJournalTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
