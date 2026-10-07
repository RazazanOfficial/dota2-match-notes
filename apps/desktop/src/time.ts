import { isPersian, type Messages } from "./i18n";

const locale = (t: Messages) => isPersian(t) ? "fa-IR" : "en-US";
const valid = (value: string | number | Date) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
};
export function formatClock24(value: string | number | Date, t: Messages, timeZone?: string) {
    const date = valid(value);
    return date ? new Intl.DateTimeFormat(locale(t), {
        hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone,
        numberingSystem: isPersian(t) ? "arabext" : "latn",
    }).format(date) : "—";
}
export function formatDateTime24(value: string | number | Date, t: Messages, timeZone = "Asia/Tehran") {
    const date = valid(value);
    return date ? new Intl.DateTimeFormat(locale(t), {
        dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone,
        numberingSystem: isPersian(t) ? "arabext" : "latn",
    }).format(date) : "—";
}
export function formatCount(value: number, t: Messages) {
    return new Intl.NumberFormat(locale(t), { useGrouping: false }).format(value);
}
