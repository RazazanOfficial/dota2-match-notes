import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildPersianCalendarMonth, PERSIAN_WEEKDAYS } from "@/lib/persian-calendar";
import { periodRange, type Scope } from "../history";
import type { Messages } from "../i18n";
// Match the production API: tracking starts on Saturday of the registration week.
export function trackingStart(registrationDate: string) { return periodRange("week", registrationDate.slice(0, 10)).from; }
export function requestRange(scope: Scope, date: string, registration: string, today: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
        return null;
    const first = trackingStart(registration);
    if (date < first || date > today)
        return null;
    const range = scope === "day" ? { from: date, to: date } : periodRange(scope, date);
    return { from: range.from < first ? first : range.from, to: range.to > today ? today : range.to };
}
export function Calendar({ value, onChange, scope = "day", min, max, t }: {
    value: string;
    onChange: (day: string) => void;
    scope?: Scope;
    min: string;
    max: string;
    t: Messages;
}) {
    const [cursor, setCursor] = useState(value || max);
    const month = buildPersianCalendarMonth(cursor);
    const range = requestRange(scope, value, min, max);
    return <div className="calendar" aria-label={t.selectedDate}>
    <header><button aria-label={t.previousMonth} disabled={month.firstKey <= min} onClick={() => setCursor(month.previousCursor)}><ChevronLeft size={17}/></button><div><strong>{month.persianTitle}</strong><small dir="ltr">{month.gregorianTitle}</small></div><button aria-label={t.nextMonth} disabled={month.lastKey >= max} onClick={() => setCursor(month.nextCursor)}><ChevronRight size={17}/></button></header>
    <div className="calendar-grid" dir="rtl">{PERSIAN_WEEKDAYS.map((day, i) => <small key={day} title={day}>{document.documentElement.lang === "fa" ? day.slice(0, 1) : ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"][i]}</small>)}{Array.from({ length: month.leadingBlankDays }, (_, i) => <span key={`blank-${i}`}/>)}{month.days.map(day => <button key={day.key} disabled={day.key < min || day.key > max} aria-label={day.key} aria-pressed={day.key === value} className={`${range && day.key >= range.from && day.key <= range.to ? "in-range" : ""} ${day.key === value ? "selected" : ""}`} onClick={() => onChange(day.key)}><b>{day.persianDay}</b><small dir="ltr">{day.gregorianDay}</small></button>)}</div>
  </div>;
}
