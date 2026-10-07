import { describe, expect, it } from "vitest";
import { formatClock24, formatCount, formatDateTime24 } from "../src/time";
import { messages } from "../src/i18n";
const clean = (value: string) => value.replace(/[\u200e\u200f]/g, "");
describe("localized 24-hour clocks", () => {
    it("uses Latin English and Persian digits without AM/PM", () => {
        const value = "2026-10-07T14:05:00Z";
        expect(clean(formatClock24(value, messages.en, "UTC"))).toBe("14:05");
        expect(clean(formatClock24(value, messages.fa, "UTC"))).toBe("۱۴:۰۵");
        expect(formatCount(12, messages.fa)).toBe("۱۲");
    });
    it.each([messages.fa, messages.en])("shows midnight as zero and keeps the full date's clock 24-hour", t => {
        expect(clean(formatClock24("2026-10-07T00:00:00Z", t, "UTC"))).toBe(t === messages.fa ? "۰۰:۰۰" : "00:00");
        const value = clean(formatDateTime24("2026-10-07T14:05:00Z", t, "UTC"));
        expect(value).toContain(t === messages.fa ? "۱۴:۰۵" : "14:05");
        expect(value).not.toMatch(/AM|PM|ق\.ظ|ب\.ظ/i);
    });
    it("doesn't display invalid date text", () => {
        expect(formatClock24("not-a-date", messages.en)).toBe("—");
    });
});
