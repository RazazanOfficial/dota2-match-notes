import { describe, expect, it } from "vitest";
import { buildMatchAnalysis } from "../lib/dota/match-analysis";
import { calculatePerformanceScore, metricScoreWeight, performanceTone } from "../lib/dota/performance-score";

const heroIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function player(index: number) {
  const metric = (raw: number, pct: number) => ({ raw, pct });
  return {
    account_id: 1_000 + index,
    personaname: `Player ${index}`,
    player_slot: index < 5 ? index : 128 + index - 5,
    hero_id: heroIds[index],
    kills: 5 + index,
    deaths: 2 + index,
    assists: 8 + index,
    last_hits: 100 + index * 10,
    denies: index,
    gold_per_min: 400 + index * 10,
    xp_per_min: 500 + index * 10,
    net_worth: 10_000 + index * 500,
    hero_damage: 12_000 + index * 500,
    tower_damage: 800 + index * 100,
    hero_healing: index * 50,
    times: [0, 60, 120, 180],
    gold_t: [600, 1_000, 1_520, 2_120],
    xp_t: [0, 450, 980, 1_600],
    lh_t: [0, 5, 12, 20],
    dn_t: [0, 0, 1, 1],
    benchmarks: {
      gold_per_min: metric(400 + index * 10, .8),
      xp_per_min: metric(500 + index * 10, .7),
      kills_per_min: metric(.2, .65),
      deaths_per_min: metric(.1, .9),
      assists_per_min: metric(.3, .75),
      last_hits_per_min: metric(5, .6),
      denies_per_min: metric(.1, .55),
      hero_damage_per_min: metric(450, .72),
      hero_healing_per_min: metric(0, .5),
      tower_damage: metric(800, .68),
    },
  };
}

describe("match performance analysis", () => {
  it("uses the requested four percentile bands", () => {
    expect(performanceTone(80)).toBe("elite");
    expect(performanceTone(79.99)).toBe("strong");
    expect(performanceTone(60)).toBe("strong");
    expect(performanceTone(40)).toBe("steady");
    expect(performanceTone(39.99)).toBe("critical");
  });

  it("reduces score weight for low-volume healing and tower damage", () => {
    const lowHeal = { key: "hero_healing_per_min", value: 20 };
    const relevantHeal = { key: "hero_healing_per_min", value: 180 };
    const lowTower = { key: "tower_damage", value: 1_000 };
    const relevantTower = { key: "tower_damage", value: 6_000 };
    expect(metricScoreWeight(lowHeal, 40)).toBeLessThan(metricScoreWeight(relevantHeal, 40));
    expect(metricScoreWeight(lowTower, 40)).toBeLessThan(metricScoreWeight(relevantTower, 40));

    const metric = (key: string, value: number, qualityPercentile: number) => ({
      key, label: key, value, formattedValue: String(value), percentile: qualityPercentile,
      qualityPercentile, tone: performanceTone(qualityPercentile), source: "hero" as const,
    });
    const baseline = [metric("gold_per_min", 500, 50), metric("xp_per_min", 600, 50)];
    const lowVolumeScore = calculatePerformanceScore([...baseline, metric("hero_healing_per_min", 20, 100)], 40);
    const relevantScore = calculatePerformanceScore([...baseline, metric("hero_healing_per_min", 180, 100)], 40);
    expect(lowVolumeScore).toBeLessThan(relevantScore);
  });

  it("builds benchmark and minute timelines for all ten players", () => {
    const analysis = buildMatchAnalysis({
      profileAccountId: 1_000,
      rawData: {
        match_id: 8971123832,
        start_time: 1_787_000_000,
        duration: 2_400,
        radiant_win: true,
        radiant_score: 40,
        dire_score: 30,
        radiant_gold_adv: [0, 200, 500, 900],
        radiant_xp_adv: [0, -100, 200, 600],
        players: heroIds.map((_, index) => player(index)),
      },
    });

    expect(analysis?.players).toHaveLength(10);
    expect(analysis?.coverage).toEqual({ benchmarkPlayers: 10, timelinePlayers: 10, totalPlayers: 10 });
    expect(analysis?.players[0].isProfilePlayer).toBe(true);
    expect(analysis?.players[0].benchmarks).toHaveLength(10);
    expect(analysis?.players[0].timeline.map((point) => point.minute)).toEqual([0, 1, 2, 3]);
    expect(analysis?.players[0].benchmarks.find((metric) => metric.key === "deaths_per_min")?.qualityPercentile).toBe(10);
  });

  it("falls back to comparison inside the match when hero benchmarks are absent", () => {
    const players = heroIds.map((_, index) => {
      const { benchmarks: _benchmarks, ...withoutBenchmarks } = player(index);
      return withoutBenchmarks;
    });
    const analysis = buildMatchAnalysis({ rawData: { match_id: 8971055324, start_time: 1_787_000_000, duration: 2_400, radiant_win: false, players } });
    expect(analysis?.players).toHaveLength(10);
    expect(analysis?.players.every((entry) => entry.benchmarkSource === "match")).toBe(true);
  });

  it("keeps low healing in benchmarks without promoting it to strengths", () => {
    const players = heroIds.map((_, index) => player(index));
    players[0].hero_healing = 1_000;
    players[0].benchmarks.hero_healing_per_min = { raw: 25, pct: .98 };
    const analysis = buildMatchAnalysis({
      profileAccountId: 1_000,
      rawData: {
        match_id: 8971123844,
        start_time: 1_787_000_000,
        duration: 2_400,
        radiant_win: true,
        players,
      },
    });
    const profile = analysis?.players[0];
    const healing = profile?.benchmarks.find((metric) => metric.key === "hero_healing_per_min");
    expect(healing?.qualityPercentile).toBe(98);
    expect(healing?.highlightEligible).toBe(false);
    expect(profile?.strengths.some((metric) => metric.key === "hero_healing_per_min")).toBe(false);
  });

  it("uses STRATZ minute stats when OpenDota replay arrays are unavailable", () => {
    const players = heroIds.map((_, index) => {
      const value = player(index);
      const { times: _times, gold_t: _gold, xp_t: _xp, lh_t: _lh, dn_t: _dn, ...withoutTimeline } = value;
      return withoutTimeline;
    });
    const stratzPlayers = players.map((entry, index) => ({
      steamAccountId: entry.account_id,
      playerSlot: entry.player_slot,
      heroId: entry.hero_id,
      position: `POSITION_${(index % 5) + 1}`,
      stats: {
        networthPerMinute: [600, 1_000, 1_500],
        experiencePerMinute: [0, 430, 940],
        lastHitsPerMinute: [0, 5, 12],
        deniesPerMinute: [0, 0, 1],
        heroDamagePerMinute: [0, 200, 550],
        healPerMinute: [0, 0, 0],
        impPerMinute: [0, index === 0 ? -8 : 3, index === 0 ? -10 : 4],
      },
    }));
    const analysis = buildMatchAnalysis({
      rawData: { match_id: 8971629698, start_time: 1_787_000_000, duration: 2_400, radiant_win: true, players },
      stratzRawData: { id: 8971629698, players: stratzPlayers },
    });
    expect(analysis?.coverage.timelinePlayers).toBe(10);
    expect(analysis?.players[0].timeline).toHaveLength(3);
    expect(analysis?.players[0].timeline[2].state).toBe("out");
    expect(analysis?.players[1].positionLabel).toBe("Mid");
  });
});
