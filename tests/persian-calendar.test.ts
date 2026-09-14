import { describe, expect, it } from "vitest";
import { buildPersianCalendarMonth, selectedWeekRange } from "../lib/persian-calendar";

describe("Persian calendar month", () => {
  it("builds a complete Solar Hijri month with Gregorian companion days", () => {
    const month = buildPersianCalendarMonth("2025-11-01");

    expect(month.persianTitle).toContain("آبان");
    expect(month.firstKey).toBe("2025-10-23");
    expect(month.lastKey).toBe("2025-11-21");
    expect(month.leadingBlankDays).toBe(5);
    expect(month.days).toHaveLength(30);
    expect(month.days[0]).toEqual({
      key: "2025-10-23",
      persianDay: 1,
      gregorianDay: 23,
    });
    expect(month.gregorianTitle).toBe("Oct – Nov 2025");
  });

  it("selects the Saturday-to-Friday week independent from the journal week", () => {
    expect(selectedWeekRange("2026-09-14", "2026-01-01", "2026-09-30")).toEqual({
      from: "2026-09-12",
      to: "2026-09-18",
    });
  });

  it("clamps the selected week to registration and today", () => {
    expect(selectedWeekRange("2026-09-14", "2026-09-14", "2026-09-16")).toEqual({
      from: "2026-09-14",
      to: "2026-09-16",
    });
  });
});
