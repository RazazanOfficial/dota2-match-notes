import { describe, expect, it, vi } from "vitest";
import { monthIsSettled, performanceJobs, previousMonth, referenceMonthsForMatch, weekStartsInMonth, weightedMean, RANKS, RANK_GROUPS, REFERENCE_POLICY, PREVIOUS_REFERENCE_POLICY, referenceTaskTotals, referenceWindow } from "../src/lib/monthly-reference/model";
import { fetchMonthlyPerformance, fetchMonthlyMeta, parseWeeklyMetaPage, metaQuery, parseMeta, parsePerformance, performanceQuery } from "../src/lib/monthly-reference/providers";
import { MonthlyMetaPendingError, pendingMetaRetryAt } from "../src/lib/monthly-reference/availability";
import { poolDivineImmortalMeta } from "../src/lib/monthly-reference/selection";

describe("monthly reference contract", () => {
  function weeklyData(month: Date, count = 100) {
    return {data:{heroStats:Object.fromEntries([1,2,3,4,5].map(position=>[`pos${position}`,weekStartsInMonth(month).map(week=>({week:week/1000,heroId:50,matchCount:count*position,winCount:count*position/2}))]))}};
  }
  it("requires every target week at every position and never relabels another period", () => {
    const september = new Date("2026-09-01T00:00:00Z");
    expect(() => parseMeta(weeklyData(new Date("2026-08-01T00:00:00Z")), september, "DIVINE", 22)).toThrow(MonthlyMetaPendingError);
    const missing = weeklyData(september);
    missing.data.heroStats.pos5.splice(2,1);
    try { parseMeta(missing,september,"DIVINE",22); throw new Error("Should reject missing week"); }
    catch (error) { expect(error).toMatchObject({referenceMonth:"2026-09-01",missingWeeks:["2026-09-17"],position:5}); }
    for (const week of [0,2959,1789603200000,"1789603200",1789603201]) {
      expect(()=>parseWeeklyMetaPage({data:{heroStats:{pos1:[{week,heroId:1,matchCount:10,winCount:5}]}}},1)).toThrow("timestamp");
    }
    const invalid = weeklyData(september); invalid.data.heroStats.pos1[0].winCount=101;
    expect(()=>parseMeta(invalid,september,"DIVINE",22)).toThrow("counts");
    const duplicate = weeklyData(september); duplicate.data.heroStats.pos1.push(duplicate.data.heroStats.pos1[0]);
    expect(()=>parseMeta(duplicate,september,"DIVINE",22)).toThrow("Duplicate");
    const overflow = weeklyData(september,1000000000);
    expect(()=>parseMeta(overflow,september,"DIVINE",22)).toThrow("capacity");
    const recorded = new Date("2026-10-11T09:00:00Z");
    const message = new MonthlyMetaPendingError("2026-09-01",["2026-08-27"],["2026-09-03"]).message;
    expect(pendingMetaRetryAt(message,recorded,new Date("2026-10-11T09:59:59Z"))?.toISOString()).toBe("2026-10-11T10:00:00.000Z");
    expect(pendingMetaRetryAt(message,recorded,new Date("2026-10-11T10:00:00Z"))).toBeNull();
    expect(pendingMetaRetryAt("network failure",recorded,recorded)).toBeNull();
  });
  it("sums weekly counts then computes weighted rates, excluding weeks outside the window", () => {
    const month = new Date("2026-09-01T00:00:00Z");
    const data = weeklyData(month);
    data.data.heroStats.pos1[0].matchCount = 1000;
    data.data.heroStats.pos1[0].winCount = 900;
    data.data.heroStats.pos1.push({week:1790812800,heroId:50,matchCount:999999,winCount:1});
    const rows = parseMeta(data,month,"DIVINE",22);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({matchCount:1300,winCount:1050,winRate:1050/1300*100});
    expect(rows[4]).toMatchObject({matchCount:2000,positionShare:2000/6900*100,metaPickRate:100});
  });
  it("uses bounded per-position pages, includes every hero and rejects overlaps or partial transfers", async () => {
    const month=new Date("2026-08-01T00:00:00Z"),now=new Date("2026-10-11T00:00:00Z");
    const latest=Date.parse("2026-10-01T00:00:00Z")/1000;
    const fetch=vi.fn(async(query:string)=>{
      const position=Number(query.match(/POSITION_(\d)/)![1]);
      const skip=Number(query.match(/skip: (\d+)/)![1]);
      expect(query).toContain("take: 8"); expect(query).not.toContain("groupBy:");
      expect(query).not.toContain("heroIds:");
      return {data:{heroStats:{[`pos${position}`]:Array.from({length:8},(_,i)=>({week:latest-(skip+i)*604800,heroId:50,matchCount:100,winCount:50}))}}};
    });
    expect(await fetchMonthlyMeta(month,"DIVINE",{id:22,name:"ALL_PICK_RANKED"},fetch,now)).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(10);
    fetch.mockClear(); fetch.mockRejectedValueOnce(new Error("partial body"));
    await expect(fetchMonthlyMeta(month,"DIVINE",{id:22,name:"ALL_PICK_RANKED"},fetch,now)).rejects.toThrow("partial body");
    fetch.mockReset(); fetch.mockImplementation(async query=>{
      const p=Number(query.match(/POSITION_(\d)/)![1]);
      return {data:{heroStats:{[`pos${p}`]:Array.from({length:8},(_,i)=>({week:latest-i*604800,heroId:50,matchCount:100,winCount:50}))}}};
    });
    await expect(fetchMonthlyMeta(month,"DIVINE",{id:22,name:"ALL_PICK_RANKED"},fetch,now)).rejects.toThrow("Overlapping");
  });
  it("does not advance past a source gap or request unsettled/future months", async () => {
    const month=new Date("2026-09-01T00:00:00Z");
    const fetch=vi.fn(async()=>({data:{heroStats:{pos1:[{week:1787788800,heroId:1,matchCount:1,winCount:1}]}}}));
    await expect(fetchMonthlyMeta(month,"DIVINE",{id:22,name:"ALL_PICK_RANKED"},fetch,new Date("2026-10-11T00:00:00Z"))).rejects.toBeInstanceOf(MonthlyMetaPendingError);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    await expect(fetchMonthlyMeta(month,"DIVINE",{id:22,name:"ALL_PICK_RANKED"},fetch,new Date("2026-10-01T00:00:00Z"))).rejects.toThrow("settled");
    expect(fetch).not.toHaveBeenCalled();
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
  it("keeps old Divine/Immortal progress totals accurate while identifying the new weekly policy", () => {
    const month=new Date("2026-09-01T00:00:00Z");
    expect(referenceTaskTotals(month,REFERENCE_POLICY)).toEqual({metaTotal:4,performanceTotal:128});
    expect(referenceTaskTotals(month,PREVIOUS_REFERENCE_POLICY)).toEqual({metaTotal:4,performanceTotal:128});
    expect(referenceTaskTotals(month,"stratz-ranked-assumed")).toEqual({metaTotal:16,performanceTotal:512});
  });
  it("handles every month, four/five-week windows, leap years and future year changes generically", () => {
    for (const year of [2026,2027,2028,2031]) for (let index=0;index<12;index++) {
      const month=new Date(Date.UTC(year,index,1));
      const starts=weekStartsInMonth(month);
      expect([4,5]).toContain(starts.length);
      expect(starts.every(week=>new Date(week).getUTCMonth()===index && new Date(week).getUTCDay()===4)).toBe(true);
      const eligible=starts.at(-1)!+9*86400000;
      expect(monthIsSettled(month,new Date(eligible-1))).toBe(false);
      expect(monthIsSettled(month,new Date(eligible))).toBe(true);
      expect(referenceWindow(month).weekStarts).toHaveLength(starts.length);
    }
    expect(referenceWindow(new Date("2026-12-01T00:00:00Z"))).toMatchObject({start:"2026-12-03",endExclusive:"2027-01-07"});
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

  it("limits query inputs to supported weekly cohorts and safe bounded pages", () => {
    expect(metaQuery("DIVINE","ALL_PICK_RANKED",1)).toContain("winWeek");
    expect(()=>metaQuery("DIVINE","ALL_PICK_RANKED",0)).toThrow("scope");
    expect(()=>metaQuery("HERALD","TURBO",1)).toThrow("scope");
    expect(()=>metaQuery("DIVINE","TURBO",1,100)).toThrow("scope");
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
