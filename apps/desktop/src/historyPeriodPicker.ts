import { periodRange } from "./history";
import { isPersian, type Messages } from "./i18n";

const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
const partCache = new Map<string, {year:number; month:number}>();
const dayCache = new Map<string, number>();
const monthCache = new Map<string, {firstKey:string;lastKey:string;previousCursor:string;nextCursor:string}>();
const monthLabels = Object.fromEntries(["fa", "en"].flatMap(language => [false,true].map(year => [`${language}-${year}`,new Intl.DateTimeFormat(language === "fa" ? "fa-IR-u-ca-persian" : "en-US-u-ca-persian",{month:"long",...(year?{year:"numeric" as const}:{}),timeZone:"UTC"})])));
const dayLabels = {fa:new Intl.DateTimeFormat("fa-IR-u-ca-persian",{day:"numeric",month:"short",timeZone:"UTC"}),en:new Intl.DateTimeFormat("en-GB-u-ca-gregory",{day:"numeric",month:"short",timeZone:"UTC"})};
export function persianPeriodParts(key: string) {
    const existing = partCache.get(key); if(existing) return existing;
    const values = Object.fromEntries(parts.formatToParts(new Date(`${key}T12:00:00Z`)).map(part => [part.type, part.value]));
    const result = {year:Number(values.year),month:Number(values.month)};
    if(partCache.size>=512) { partCache.clear(); dayCache.clear(); }
    partCache.set(key,result); dayCache.set(key,Number(values.day)); return result;
}
export function periodMonth(key: string) {
    const parts = persianPeriodParts(key), id = `${parts.year}-${parts.month}`;
    const existing = monthCache.get(id); if(existing) return existing;
    // A month picker needs boundaries, not thirty individual calendar cells.
    const first = new Date(`${key}T12:00:00Z`); first.setUTCDate(first.getUTCDate()-(dayCache.get(key)!-1));
    const firstKey=first.toISOString().slice(0,10),next=new Date(first); next.setUTCDate(next.getUTCDate()+29);
    while(persianPeriodParts(next.toISOString().slice(0,10)).month===parts.month) next.setUTCDate(next.getUTCDate()+1);
    const previous=new Date(first);previous.setUTCDate(previous.getUTCDate()-1);
    const last=new Date(next);last.setUTCDate(last.getUTCDate()-1);
    const month={firstKey,lastKey:last.toISOString().slice(0,10),previousCursor:previous.toISOString().slice(0,10),nextCursor:next.toISOString().slice(0,10)};
    if(monthCache.size>=96) monthCache.clear(); monthCache.set(id,month); return month;
}
export function shiftPeriodMonth(key: string, amount: number) {
    let cursor = key;
    for (let i = 0; i < Math.abs(amount); i++) {
        const month = periodMonth(cursor);
        cursor = amount < 0 ? month.previousCursor : month.nextCursor;
    }
    return periodMonth(cursor).firstKey;
}
export function periodMonthsInYear(cursor: string) {
    let key = shiftPeriodMonth(cursor, 1 - persianPeriodParts(cursor).month);
    return Array.from({ length: 12 }, () => { const month = periodMonth(key); key = month.nextCursor; return month; });
}
export function periodWeeksInMonth(cursor: string, min: string, max: string) {
    const month = periodMonth(cursor), first = periodRange("week", month.firstKey).from;
    const result: Array<{ from: string; to: string; anchor: string; index: number; enabled: boolean }> = [];
    for (let from = first, index = 1; from <= month.lastKey; index++) {
        const range = periodRange("week", from);
        result.push({ from: range.from < min ? min : range.from, to: range.to > max ? max : range.to, anchor: [range.from, month.firstKey, min].sort().at(-1)!, index, enabled: range.to >= min && range.from <= max });
        const date = new Date(`${from}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 7); from = date.toISOString().slice(0, 10);
    }
    return result;
}
export function periodMonthLabel(key: string, t: Messages, year = false) {
    return monthLabels[`${isPersian(t)?"fa":"en"}-${year}`].format(new Date(`${key}T12:00:00Z`));
}
export function periodDayLabel(key: string, t: Messages) {
    return dayLabels[isPersian(t)?"fa":"en"].format(new Date(`${key}T12:00:00Z`));
}
