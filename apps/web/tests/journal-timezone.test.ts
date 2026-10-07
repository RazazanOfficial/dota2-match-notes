import { afterEach, describe, expect, it } from "vitest";
import {
  getJournalTimeZone,
  toJournalDateKey,
} from "../lib/journal/timezone";

const ORIGINAL_TIME_ZONE = process.env.JOURNAL_TIME_ZONE;

afterEach(() => {
  if (ORIGINAL_TIME_ZONE === undefined) delete process.env.JOURNAL_TIME_ZONE;
  else process.env.JOURNAL_TIME_ZONE = ORIGINAL_TIME_ZONE;
});

describe("journal timezone", () => {
  it("defaults to Tehran and crosses midnight independently of VPS UTC", () => {
    delete process.env.JOURNAL_TIME_ZONE;
    expect(getJournalTimeZone()).toBe("Asia/Tehran");
    expect(toJournalDateKey(new Date("2026-08-11T21:30:00.000Z"))).toBe(
      "2026-08-12",
    );
  });

  it("accepts another IANA timezone and rejects invalid configuration", () => {
    process.env.JOURNAL_TIME_ZONE = "America/New_York";
    expect(toJournalDateKey(new Date("2026-08-11T21:30:00.000Z"))).toBe(
      "2026-08-11",
    );

    process.env.JOURNAL_TIME_ZONE = "not-a-timezone";
    expect(() => getJournalTimeZone()).toThrow("JOURNAL_TIME_ZONE");
  });
});
