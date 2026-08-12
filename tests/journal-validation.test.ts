import { describe, expect, it } from "vitest";
import {
  dayInputSchema,
  parseDateKey,
  parseDateRange,
  parseHandle,
} from "../lib/journal/validation";

function match(id = "11111111-1111-4111-8111-111111111111") {
  return {
    id,
    number: 1,
    heroId: 1,
    heroName: "Anti-Mage",
    banIds: [2, 3],
    legacyBans: "",
    role: "safe_lane" as const,
    queueType: "role_selected" as const,
    notes: "test",
    result: "win" as const,
    createdAt: "2026-08-03T12:00:00.000Z",
  };
}

describe("journal validation", () => {
  it("accepts the existing saveDay transport contract", () => {
    const item = match();
    const result = dayInputSchema.safeParse({
      completed: false,
      matches: { [item.id]: item },
    });

    expect(result.success).toBe(true);
  });

  it("rejects mismatched ids and duplicate game numbers", () => {
    const first = match();
    const second = { ...match("22222222-2222-4222-8222-222222222222") };
    const result = dayInputSchema.safeParse({
      completed: false,
      matches: {
        wrong: first,
        [second.id]: second,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    expect(parseDateKey("2026-02-29").success).toBe(false);
    expect(parseDateKey("2028-02-29").success).toBe(true);
  });

  it("limits journal reads to 62 days", () => {
    const valid = new URLSearchParams({ from: "2026-08-01", to: "2026-09-30" });
    const invalid = new URLSearchParams({ from: "2026-08-01", to: "2026-10-02" });

    expect(parseDateRange(valid).success).toBe(true);
    expect(parseDateRange(invalid).success).toBe(false);
  });

  it("normalizes a bare Steam account id for public journal reads", () => {
    expect(parseHandle("988195076")).toBe("steam_988195076");
    expect(parseHandle("steam_988195076")).toBe("steam_988195076");
  });
});
