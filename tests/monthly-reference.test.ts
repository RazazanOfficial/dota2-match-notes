import { describe, expect, it } from "vitest";
import { monthIsSettled, performanceJobs, previousMonth, weekStartsInMonth, weightedMean, RANKS, RANK_GROUPS } from "../lib/monthly-reference/model";
import { metaQuery, parseMeta, parsePerformance, performanceQuery } from "../lib/monthly-reference/providers";
import { poolDivineImmortalMeta } from "../lib/monthly-reference/selection";

describe("monthly reference contract", () => {
  it("assigns a crossing week entirely to its starting month and waits for it to finish", () => {
    const august = new Date("2026-08-01T00:00:00Z");
    const starts = weekStartsInMonth(august).map(value => new Date(value).toISOString().slice(0, 10));
    expect(starts).toEqual(["2026-08-06", "2026-08-13", "2026-08-20", "2026-08-27"]);
    expect(monthIsSettled(august, new Date("2026-09-02T00:00:00Z"))).toBe(false);
    expect(monthIsSettled(august, new Date("2026-09-05T00:00:00Z"))).toBe(true);
    expect(weekStartsInMonth(new Date("2026-09-01T00:00:00Z")).map(value => new Date(value).toISOString().slice(0, 10))).not.toContain("2026-08-27");
    expect(previousMonth(new Date("2026-08-28T16:00:00Z")).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("uses sample counts to combine cohort means", () => {
    expect(weightedMean(10, 100, 20, 900)).toBe(19);
  });

  it("requests the previous calendar month for each role and rejects a missing month", () => {
    expect(metaQuery("DIVINE", "ALL_PICK_RANKED")).toContain("gameModeIds: [ALL_PICK_RANKED]");
    const month = new Date("2026-08-01T00:00:00Z");
    const august = month.getTime() / 1000;
    const data = Object.fromEntries([1, 2, 3, 4, 5].map(position => [
      `pos${position}`,
      [{ month: august, heroId: 50, matchCount: position * 100, winCount: position * 50 }],
    ]));
    const rows = parseMeta({ data: { heroStats: data } }, month, "DIVINE", 22);
    expect(rows).toHaveLength(5);
    expect(rows[4]).toMatchObject({ heroId: 50, position: 5, positionShare: 500 / 1500 * 100, gameMode: 22 });
    expect(() => parseMeta({ data: { heroStats: Object.fromEntries([1, 2, 3, 4, 5].map(position => [`pos${position}`, []])) } }, month, "DIVINE", 22)).toThrow("insufficient");
  });

  it("accepts STRATZ epoch week input and validates the output cohort and fields", () => {
    const week = 2959 * 7 * 86400 * 1000;
    expect(performanceQuery(week, "DIVINE_IMMORTAL", [50])).toContain("week: 1789603200");
    const raw = { heroId: 50, week: 2959, time: 11, position: "POSITION_5", bracketBasicIds: "DIVINE_IMMORTAL", matchCount: 7823, remainingMatchCount: 7823,
      cs: 7.56, dn: 2.2, kills: 1.47, deaths: 2.23, assists: 3.04, networth: 2057.29,
      xp: 2400, heroDamage: 3600, towerDamage: 10, healingAllies: 400, campsStacked: .5,
      neutrals: 1, ancients: 0, teamKills: 5 };
    const output = { data: { heroStats: { stats: [raw] } } };
    expect(parsePerformance(output, week, "DIVINE_IMMORTAL", [50])[0]).toMatchObject({
      minute: 11, sampleCount: 7823, means: { cs: 7.56, campsStacked: .5 },
    });
    expect(() => parsePerformance({ data: { heroStats: { stats: [{ ...raw, week: 2960 }] } } }, week, "DIVINE_IMMORTAL", [50])).toThrow("Invalid STRATZ performance cohort");
    const jobs = performanceJobs(new Date("2026-08-01T00:00:00Z"));
    expect(RANKS).toEqual(["DIVINE", "IMMORTAL"]);
    expect(RANK_GROUPS).toEqual(["DIVINE_IMMORTAL"]);
    expect(jobs).toHaveLength(128);
    expect(jobs.every(job => job.rank === "DIVINE_IMMORTAL")).toBe(true);
  });

  it("pools only Divine and Immortal Meta by match count, regardless of user rank", () => {
    const meta = poolDivineImmortalMeta([
      { heroId: 50, position: 5, rankBracket: "DIVINE", gameMode: 22, matchCount: 600, winCount: 300 },
      { heroId: 50, position: 5, rankBracket: "IMMORTAL", gameMode: 22, matchCount: 400, winCount: 240 },
      { heroId: 50, position: 4, rankBracket: "DIVINE", gameMode: 22, matchCount: 250, winCount: 125 },
      { heroId: 50, position: 5, rankBracket: "HERALD", gameMode: 22, matchCount: 9000, winCount: 3000 },
    ], [{ position: 5, gameMode: 22, count: 20000 }, { position: 4, gameMode: 22, count: 10000 }]);
    expect(meta).toHaveLength(2);
    expect(meta.find(row => row.position === 5)).toMatchObject({ rankBracket: "DIVINE_IMMORTAL",
      matchCount: 1000, winCount: 540, positionSampleCount: 20000, positionShare: 80, winRate: 54, metaPickRate: 5 });
  });
});
