import { describe, expect, it, vi } from "vitest";
import { monthIsSettled, performanceJobs, previousMonth, referenceMonthsForMatch, weekStartsInMonth, weightedMean, RANKS, RANK_GROUPS, REFERENCE_POLICY, shouldResetLatestMonth } from "../src/lib/monthly-reference/model";
import { fetchMonthlyPerformance, metaQuery, parseMeta, parsePerformance, performanceQuery } from "../src/lib/monthly-reference/providers";
import { MonthlyMetaPendingError, pendingMetaRetryAt } from "../src/lib/monthly-reference/availability";
import { poolDivineImmortalMeta } from "../src/lib/monthly-reference/selection";

describe("monthly reference contract", () => {
  it("distinguishes a missing source month from malformed timestamps and never relabels August as September", () => {
    const make = (timestamp: number | string) => ({data:{heroStats:Object.fromEntries([1,2,3,4,5].map(p=>[`pos${p}`,[{month:timestamp,heroId:50,matchCount:100,winCount:50}]]))}});
    const september = new Date("2026-09-01T00:00:00Z");
    expect(() => parseMeta(make(1785542400), september, "DIVINE", 22)).toThrow(MonthlyMetaPendingError);
    try { parseMeta(make(1785542400), september, "DIVINE", 22); }
    catch (error) { expect(error).toMatchObject({referenceMonth:"2026-09-01", availableMonths:["2026-08-01"]}); }
    for (const value of [0, 680, 1785542400000, "1785542400", 1785542401]) {
      expect(() => parseMeta(make(value), september, "DIVINE", 22)).toThrow("timestamp");
    }
    expect(parseMeta(make(september.getTime()/1000),september,"DIVINE",22)).toHaveLength(5);
    const incomplete=make(september.getTime()/1000);
    incomplete.data.heroStats.pos5=[];
    expect(()=>parseMeta(incomplete,september,"DIVINE",22)).toThrow("insufficient");
    const recorded = new Date("2026-10-11T09:00:00Z");
    const message = new MonthlyMetaPendingError("2026-09-01",["2026-08-01"]).message;
    expect(pendingMetaRetryAt(message,recorded,new Date("2026-10-11T09:59:59Z"))?.toISOString()).toBe("2026-10-11T10:00:00.000Z");
    expect(pendingMetaRetryAt(message,recorded,new Date("2026-10-11T10:00:00Z"))).toBeNull();
    expect(pendingMetaRetryAt("network failure",recorded,recorded)).toBeNull();
  });

  it("fetches each hero separately without changing the job cursor or losing any minute/metric", async () => {
    const job={week:2957*604800000,rank:"DIVINE_IMMORTAL",heroIds:[102,73,68,1]};
    const fetch=vi.fn(async (query:string) => {
      const ids=JSON.parse(`[${query.match(/heroIds: \[([^\]]+)\]/)![1]}]`) as number[];
      expect(ids).toHaveLength(1);
      expect(query).toContain("POSITION_1,POSITION_2,POSITION_3,POSITION_4,POSITION_5");
      expect(query).toContain("minTime: 0, maxTime: 75");
      const stats=[0,13,75].map(time=>({heroId:ids[0],time,week:2957,position:"POSITION_1",bracketBasicIds:job.rank,remainingMatchCount:100,
        cs:1,dn:1,kills:1,deaths:1,assists:1,networth:1,xp:1,heroDamage:1,towerDamage:1,healingAllies:1,campsStacked:1,neutrals:1,ancients:1,teamKills:1}));
      return {data:{heroStats:{stats}}};
    });
    const result=await fetchMonthlyPerformance(job,fetch);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result).toHaveLength(12);
    expect(result.map(r=>r.heroId)).toEqual([102,102,102,73,73,73,68,68,68,1,1,1]);
    fetch.mockClear();
    fetch.mockRejectedValueOnce(new Error("incomplete transfer"));
    await expect(fetchMonthlyPerformance(job,fetch)).rejects.toThrow("incomplete transfer");
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    fetch.mockResolvedValueOnce({data:{heroStats:{stats:[]}}});
    fetch.mockRejectedValueOnce(new Error("second hero failed"));
    await expect(fetchMonthlyPerformance(job,fetch)).rejects.toThrow("second hero failed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("limits a missing September reference to the active August fallback for October matches", () => {
    expect(referenceMonthsForMatch(new Date("2026-10-01T19:30:00Z")))
      .toEqual(["2026-09-01", "2026-08-01"]);
    expect(referenceMonthsForMatch(new Date("2027-01-01T00:00:00Z")))
      .toEqual(["2026-12-01", "2026-11-01"]);
  });
  it("resets only the latest month on a new policy or explicit refetch", () => {
    const latest = "2026-08-01";
    expect(shouldResetLatestMonth(latest, latest, false, ["stratz-ranked-assumed"])).toBe(true);
    expect(shouldResetLatestMonth(latest, latest, false, [REFERENCE_POLICY])).toBe(false);
    expect(shouldResetLatestMonth(latest, latest, true, [REFERENCE_POLICY])).toBe(true);
    expect(shouldResetLatestMonth("2026-07-01", latest, true, ["stratz-ranked-assumed"])).toBe(false);
  });
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
