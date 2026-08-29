"use client";

import MatchDialog from "./MatchDialog";
import type { DotaTeam, Match, MatchAnalysis, MatchParticipant } from "@/lib/types";

const MOCK_MATCH: Match = {
  id: "dev-match-8967968620",
  number: 18,
  heroId: 48,
  heroName: "Luna",
  bans: [
    { id: 14, slug: "pudge", name: "Pudge" },
    { id: 1, slug: "antimage", name: "Anti-Mage" },
    { id: 86, slug: "rubick", name: "Rubick" },
  ],
  picks: [],
  role: "safe_lane",
  roleSource: "stratz",
  queueType: "role_selected",
  notes: "درگیری‌های مهم را با زمان‌بندی بهتر انتخاب کردم.",
  positivePoints: ["فشار مناسب روی لاین", "استفاده درست از تایمینگ آیتم‌ها"],
  negativePoints: ["یک مرگ غیرضروری پیش از Roshan"],
  result: "win",
  createdAt: "2026-08-28T12:00:00.000Z",
  dotaMatchId: "8967968620",
  startedAt: "2026-08-28T11:10:00.000Z",
  durationSeconds: 3_047,
  gameModeId: 22,
  gameModeName: "All Draft",
  lobbyTypeId: 7,
  lobbyTypeName: "Ranked",
  radiantWin: true,
  radiantScore: 53,
  direScore: 34,
  participants: [
    participant(0, "Meraj", 48, "Luna", "radiant", { profile: true, level: 30, scepter: true, shard: true }),
    participant(1, "Mildon", 11, "Shadow Fiend", "radiant", { level: 28, scepter: true }),
    participant(2, "Aria", 8, "Juggernaut", "radiant", { level: 27, shard: true }),
    participant(3, "حساب خصوصی", 86, "Rubick", "radiant", { level: 24 }),
    participant(4, "Nima", 5, "Crystal Maiden", "radiant", { level: 22 }),
    participant(128, "Inanis", 2, "Axe", "dire", { level: 27, scepter: true, shard: true }),
    participant(129, "حساب خصوصی", 14, "Pudge", "dire", { level: 26, scepter: true }),
    participant(130, "Kez", 47, "Viper", "dire", { level: 25, shard: true }),
    participant(131, "Night", 26, "Lion", "dire", { level: 23 }),
    participant(132, "Doc", 30, "Witch Doctor", "dire", { level: 21 }),
  ],
  images: [],
  analysis: mockAnalysis(),
};

function mockAnalysis(): MatchAnalysis {
  const heroes = [
    [0, 48, "Luna", "Meraj"], [1, 11, "Shadow Fiend", "Mildon"], [2, 8, "Juggernaut", "Aria"], [3, 86, "Rubick", "حساب خصوصی"], [4, 5, "Crystal Maiden", "Nima"],
    [128, 2, "Axe", "Inanis"], [129, 14, "Pudge", "حساب خصوصی"], [130, 47, "Viper", "Kez"], [131, 26, "Lion", "Night"], [132, 30, "Witch Doctor", "Doc"],
  ] as const;
  const metricDefinitions = [
    ["gold_per_min", "درآمد طلا"], ["xp_per_min", "کسب تجربه"], ["kills_per_min", "کیل"], ["deaths_per_min", "مرگ"], ["assists_per_min", "اسیست"],
    ["last_hits_per_min", "لست‌هیت"], ["denies_per_min", "دِنای"], ["hero_damage_per_min", "دمیج هیرو"], ["hero_healing_per_min", "هیل"], ["tower_damage", "دمیج ساختمان"],
  ] as const;
  return {
    status: "ready",
    dotaMatchId: "8967968620",
    durationMinutes: 51,
    parsed: true,
    coverage: { benchmarkPlayers: 10, timelinePlayers: 10, totalPlayers: 10 },
    teamTimeline: Array.from({ length: 52 }, (_, minute) => ({ minute, radiantGoldAdvantage: Math.round(Math.sin(minute / 7) * 1800 + minute * 180), radiantXpAdvantage: Math.round(Math.sin(minute / 6) * 1400 + minute * 130) })),
    players: heroes.map(([playerSlot, heroId, heroName, personName], playerIndex) => {
      const benchmarks = metricDefinitions.map(([key, label], metricIndex) => {
        const qualityPercentile = Math.max(5, Math.min(96, 82 - playerIndex * 4 + (metricIndex % 4) * 5 - (metricIndex === 3 ? 18 : 0)));
        return { key, label, value: 400 + metricIndex * 17, formattedValue: (400 + metricIndex * 17).toLocaleString("fa-IR"), percentile: key === "deaths_per_min" ? 100 - qualityPercentile : qualityPercentile, qualityPercentile, tone: qualityPercentile >= 85 ? "elite" as const : qualityPercentile >= 65 ? "strong" as const : qualityPercentile >= 35 ? "steady" as const : qualityPercentile >= 15 ? "weak" as const : "critical" as const, source: "hero" as const };
      });
      const sorted = [...benchmarks].sort((left, right) => right.qualityPercentile - left.qualityPercentile);
      return {
        playerSlot, accountId: personName === "حساب خصوصی" ? null : 900_000_000 + playerIndex, heroId, heroName, personName,
        team: playerSlot < 128 ? "radiant" as const : "dire" as const,
        position: (playerIndex % 5) + 1,
        positionLabel: ["Carry", "Mid", "Offlane", "Soft Support", "Hard Support"][playerIndex % 5],
        isProfilePlayer: playerIndex === 0,
        benchmarks, strengths: sorted.slice(0, 3), weaknesses: sorted.slice(-3).reverse(), benchmarkSource: "hero" as const,
        timeline: Array.from({ length: 52 }, (_, minute) => {
          const impact = Math.round(Math.sin((minute + playerIndex) / 4) * 8 + (playerIndex < 5 ? 1 : -1));
          const state = impact >= 8 ? "surge" as const : impact >= 2 ? "progress" as const : impact <= -7 && minute % 3 === 0 ? "out" as const : impact <= -3 ? "setback" as const : "steady" as const;
          return { minute, gold: 600 + minute * (430 + playerIndex * 4), xp: minute * (490 + playerIndex * 3), lastHits: minute * Math.max(1, 7 - playerIndex % 5), denies: Math.floor(minute / 7), heroDamage: minute * (410 + playerIndex * 12), heroHealing: playerIndex % 3 === 0 ? minute * 80 : 0, impact, goldDelta: 430 + playerIndex * 4, xpDelta: 490 + playerIndex * 3, lastHitDelta: Math.max(1, 7 - playerIndex % 5), state, label: state === "surge" ? "جهش عملکرد" : state === "progress" ? "روند مثبت" : state === "setback" ? "افت ریتم" : state === "out" ? "دور از جریان مچ" : "ریتم ثابت" };
        }),
      };
    }),
  };
}

type ParticipantOptions = {
  profile?: boolean;
  level: number;
  scepter?: boolean;
  shard?: boolean;
};

function participant(
  playerSlot: number,
  personName: string,
  heroId: number,
  heroName: string,
  team: DotaTeam,
  options: ParticipantOptions,
): MatchParticipant {
  const index = playerSlot >= 128 ? playerSlot - 123 : playerSlot + 5;
  return {
    playerSlot,
    accountId: personName === "حساب خصوصی" ? null : 900_000_000 + playerSlot,
    personName,
    heroId,
    heroName,
    team,
    level: options.level,
    kills: Math.max(1, 18 - index),
    deaths: Math.max(2, index - 1),
    assists: 9 + index,
    lastHits: 520 - index * 29,
    denies: Math.max(0, 16 - index),
    goldPerMinute: 760 - index * 34,
    xpPerMinute: 890 - index * 31,
    netWorth: 39_500 - index * 2_100,
    heroDamage: 54_000 - index * 2_750,
    towerDamage: Math.max(0, 9_800 - index * 920),
    heroHealing: index % 3 === 0 ? 4_200 + index * 90 : 0,
    itemIds: [108, 50, 63, 139, 116, 147],
    backpackItemIds: [38, 40, 46],
    neutralItemId: 289,
    neutralEnhancementId: null,
    hasAghanimsScepter: Boolean(options.scepter),
    hasAghanimsShard: Boolean(options.shard),
    isProfilePlayer: Boolean(options.profile),
  };
}

export default function DevMockPlayer() {
  return (
    <main className="dev-mock-player">
      <MatchDialog
        open
        readonly
        dateLabel="پنج‌شنبه ۶ شهریور"
        match={MOCK_MATCH}
        nextNumber={19}
        onClose={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
      />
    </main>
  );
}
