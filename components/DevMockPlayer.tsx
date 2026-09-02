"use client";

import MatchDialog from "./MatchDialog";
import { calculatePerformanceScore, metricScoreWeight, performanceTone } from "@/lib/dota/performance-score";
import type { DotaTeam, Match, MatchAnalysis, MatchParticipant } from "@/lib/types";

const MOCK_MATCH: Match = {
  id: "dev-match-8978303598",
  number: 18,
  heroId: 85,
  heroName: "Undying",
  bans: [
    { id: 14, slug: "pudge", name: "Pudge" },
    { id: 1, slug: "antimage", name: "Anti-Mage" },
    { id: 86, slug: "rubick", name: "Rubick" },
  ],
  picks: [],
  role: "soft_support",
  roleSource: "stratz",
  queueType: "",
  notes: "درگیری‌های مهم را با زمان‌بندی بهتر انتخاب کردم.",
  positivePoints: ["فشار مناسب روی لاین", "استفاده درست از تایمینگ آیتم‌ها"],
  negativePoints: ["یک مرگ غیرضروری پیش از Roshan"],
  result: "win",
  createdAt: "2026-08-28T12:00:00.000Z",
  dotaMatchId: "8978303598",
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
    participant(0, "Meraj", 85, "Undying", "radiant", { profile: true, level: 30, scepter: true, shard: true }),
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
    [0, 85, "Undying", "Meraj"], [1, 11, "Shadow Fiend", "Mildon"], [2, 8, "Juggernaut", "Aria"], [3, 86, "Rubick", "حساب خصوصی"], [4, 5, "Crystal Maiden", "Nima"],
    [128, 2, "Axe", "Inanis"], [129, 14, "Pudge", "حساب خصوصی"], [130, 47, "Viper", "Kez"], [131, 26, "Lion", "Night"], [132, 30, "Witch Doctor", "Doc"],
  ] as const;
  const metricDefinitions = [
    ["gold_per_min", "GPM", "میزان Gold به‌دست‌آمده در هر دقیقه", "higher"],
    ["xp_per_min", "XPM", "میزان XP به‌دست‌آمده در هر دقیقه", "higher"],
    ["kills_per_min", "Kills / min", "میانگین Kill در هر دقیقه", "higher"],
    ["deaths_per_min", "Deaths / min", "میانگین Death در هر دقیقه؛ مقدار کمتر بهتر است", "lower"],
    ["assists_per_min", "Assists / min", "میانگین Assist در هر دقیقه", "higher"],
    ["fight_participation", "Fight Participation", "درصد مشارکت در Killهای تیم", "higher"],
    ["lane_efficiency_pct", "Lane Efficiency", "بازده اقتصادی Laning Stage", "higher"],
    ["last_hits_per_min", "LH / min", "میانگین Last Hit در هر دقیقه", "higher"],
    ["denies_at_10", "Denies @10", "تعداد Deny تا پایان دقیقه ۱۰", "higher"],
    ["hero_damage_per_min", "Hero DMG / min", "Damage واردشده به Heroها در هر دقیقه", "higher"],
    ["hero_healing_per_min", "Heal / min", "میانگین Heal ثبت‌شده در هر دقیقه", "contextual"],
    ["tower_damage", "Tower DMG", "مجموع Damage واردشده به Towerها", "higher"],
  ] as const;
  return {
    status: "ready",
    dotaMatchId: "8978303598",
    durationMinutes: 51,
    parsed: true,
    coverage: { benchmarkPlayers: 10, timelinePlayers: 10, totalPlayers: 10 },
    teamTimeline: Array.from({ length: 52 }, (_, minute) => ({ minute, radiantGoldAdvantage: Math.round(Math.sin(minute / 7) * 1800 + minute * 180), radiantXpAdvantage: Math.round(Math.sin(minute / 6) * 1400 + minute * 130) })),
    players: heroes.map(([playerSlot, heroId, heroName, personName], playerIndex) => {
      const benchmarks = metricDefinitions.map(([key, label, description, direction], metricIndex) => {
        const qualityPercentile = Math.max(5, Math.min(96, 91 - playerIndex * 6 + (metricIndex % 4) * 4 - (metricIndex === 3 ? 18 : 0)));
        const values: Record<string, number> = {
          gold_per_min: 690 - playerIndex * 24,
          xp_per_min: 780 - playerIndex * 25,
          kills_per_min: Math.max(.08, (12 - Math.floor(playerIndex / 2)) / 51),
          deaths_per_min: (2 + playerIndex % 5) / 51,
          assists_per_min: (9 + playerIndex) / 51,
          fight_participation: Math.max(34, 78 - playerIndex * 3.2),
          lane_efficiency_pct: Math.max(42, 81 - (playerIndex % 5) * 6),
          last_hits_per_min: Math.max(1.1, 7.8 - (playerIndex % 5) * 1.25),
          denies_at_10: Math.max(0, 8 - (playerIndex % 5)),
          hero_damage_per_min: 720 - playerIndex * 31,
          hero_healing_per_min: heroId === 30 ? 92 : heroId === 5 ? 38 : 0,
          tower_damage: Math.max(480, 5_900 - playerIndex * 470),
        };
        const value = values[key];
        return { key, label, shortLabel: label, description, direction, highlightEligible: key !== "hero_healing_per_min" || value * 51 > 1_500, scoreWeight: metricScoreWeight({ key, value }, 51), value, formattedValue: value.toLocaleString("fa-IR", { maximumFractionDigits: 2 }), percentile: qualityPercentile, qualityPercentile, tone: performanceTone(qualityPercentile), source: "hero" as const };
      });
      const sorted = [...benchmarks].filter((metric) => metric.highlightEligible).sort((left, right) => right.qualityPercentile - left.qualityPercentile);
      return {
        playerSlot, accountId: personName === "حساب خصوصی" ? null : 900_000_000 + playerIndex, heroId, heroName, personName,
        team: playerSlot < 128 ? "radiant" as const : "dire" as const,
        position: playerIndex === 0 ? 3 : (playerIndex % 5) + 1,
        positionLabel: playerIndex === 0 ? "Offlane" : ["Carry", "Mid", "Offlane", "Soft Support", "Hard Support"][playerIndex % 5],
        positionResolution: playerIndex === 0 ? { assignedPosition: 4, detectedPosition: 3, confirmedPosition: 3, confidence: 86, source: "stratz" as const, roleSwapDetected: true, swapWithPlayerSlot: 3 } : undefined,
        isProfilePlayer: playerIndex === 0,
        kills: 12 - Math.floor(playerIndex / 2), deaths: 2 + playerIndex % 5, assists: 9 + playerIndex,
        performanceScore: calculatePerformanceScore(benchmarks, 51, playerIndex === 0 ? 3 : (playerIndex % 5) + 1), benchmarks, strengths: sorted.filter((metric) => metric.qualityPercentile >= 80).slice(0, 3), weaknesses: sorted.filter((metric) => metric.qualityPercentile < 40).reverse().slice(0, 3), benchmarkSource: "hero" as const,
        timeline: Array.from({ length: 52 }, (_, minute) => {
          const impact = Math.round(Math.sin((minute + playerIndex) / 4) * 8 + (playerIndex < 5 ? 1 : -1));
          const state = impact >= 8 ? "surge" as const : impact >= 2 ? "progress" as const : impact <= -7 && minute % 3 === 0 ? "out" as const : impact <= -3 ? "setback" as const : "steady" as const;
          const gold = Math.round(600 + minute * (430 + playerIndex * 4) + Math.sin((minute + playerIndex) / 3) * 360);
          const previousGold = minute ? Math.round(600 + (minute - 1) * (430 + playerIndex * 4) + Math.sin((minute - 1 + playerIndex) / 3) * 360) : gold;
          const xp = Math.round(minute * (490 + playerIndex * 3) + Math.sin((minute + playerIndex) / 4) * 290);
          const previousXp = minute ? Math.round((minute - 1) * (490 + playerIndex * 3) + Math.sin((minute - 1 + playerIndex) / 4) * 290) : xp;
          const lastHits = Math.max(0, Math.round(minute * Math.max(1, 7 - playerIndex % 5) + Math.sin((minute + playerIndex) / 3) * 3));
          const previousLastHits = minute ? Math.max(0, Math.round((minute - 1) * Math.max(1, 7 - playerIndex % 5) + Math.sin((minute - 1 + playerIndex) / 3) * 3)) : lastHits;
          return { minute, gold, xp, lastHits, denies: Math.floor(minute / 7), heroDamage: minute * (410 + playerIndex * 12), heroHealing: playerIndex % 3 === 0 ? minute * 80 : 0, impact, goldDelta: gold - previousGold, xpDelta: xp - previousXp, lastHitDelta: lastHits - previousLastHits, state, label: state === "surge" ? "جهش عملکرد" : state === "progress" ? "روند مثبت" : state === "setback" ? "افت ریتم" : state === "out" ? "دور از جریان مچ" : "ریتم ثابت" };
        }),
        events: playerIndex === 0 ? [
          { id: "death-720", minute: 12, second: 720, type: "death" as const, label: "Death", positive: false },
          { id: "ward-915", minute: 15, second: 915, type: "sentry" as const, label: "Sentry Ward", positive: true },
          { id: "objective-1210", minute: 20, second: 1_210, type: "objective" as const, label: "Tower", positive: true },
        ] : [],
        cohort: { label:`Hero + Position ${playerIndex === 0 ? 3 : (playerIndex % 5) + 1} + Rank + Patch + Mode`,heroPositionSamples:profileSamples(playerIndex),positionSamples:842,heroPositionWeight:Math.round(profileSamples(playerIndex)/(profileSamples(playerIndex)+200)*100),positionPickRate:playerIndex===0?8.4:20,rankTier:73,patch:"7.41",gameMode:22,confidence:playerIndex===0?"medium" as const:"high" as const,limitations:playerIndex===0?["نمونه Hero + Position با Position عمومی ترکیب شده است."]:[],milestones:[5,10,20,30,40,60].map((minute)=>({minute,gold:600+minute*430,xp:minute*490,lastHits:minute*6,sampleSize:profileSamples(playerIndex)})) },
        itemTimings: [{key:"mekansm",label:"Mekansm",minute:15,second:930,category:"utility" as const,relativeToReference:"early" as const,deltaMinutes:-2.4,referenceMinute:17.9,note:"۲٫۴ دقیقه زودتر از میانه Hero + Position"},{key:"guardian_greaves",label:"Guardian Greaves",minute:24,second:1460,category:"utility" as const,relativeToReference:"on_time" as const,deltaMinutes:.8,referenceMinute:23.5,note:"نزدیک به میانه Hero + Position"}],
        map: mockMapAnalysis(playerIndex),
      };
    }),
  };
}

function profileSamples(playerIndex:number){return playerIndex===0?31:260-playerIndex*7;}

function mockMapAnalysis(playerIndex: number) {
  const profile = playerIndex === 0;
  return {
    availability: "partial" as const,
    coordinateSource: "timed" as const,
    points: Array.from({ length: profile ? 26 : 14 }, (_, index) => ({
      x: Math.max(4, Math.min(96, 17 + playerIndex * 4 + index * 2.4)),
      y: Math.max(4, Math.min(96, 81 - playerIndex * 2 - index * 1.75 + Math.sin(index) * 7)),
      minute: index % 3 === 0 ? index * 2 : null,
      weight: 1 + index % 5,
      type: index % 8 === 0 ? "vision" as const : index % 6 === 0 ? "combat" as const : "movement" as const,
      label: index % 8 === 0 ? "Vision" : undefined,
    })),
    trail: Array.from({length:12},(_,index)=>({x:20+index*4,y:78-index*3,minute:index*3,weight:1,type:"movement" as const})),
    farm: { availability: "partial" as const, laneCreeps: profile ? 176 : 150 - playerIndex * 3, neutralCreeps: profile ? 91 : 70, ancientCreeps: profile ? 18 : 9, stackedCamps: profile ? 4 : 2, farmUptimePercent: profile ? 71 : 62, recoveryRate: profile ? 67 : 54, deathCost: profile ? 640 : null,emptyTravelMinutes:profile?4:7,farmToImpact:profile?82:64,sourceMix:{lane:62,neutral:32,ancient:6},windows:[{from:0,to:5,lastHits:24,netWorth:2100,xp:2300,farmGain:1500,deaths:0,state:"progress" as const,note:"شروع پایدار"},{from:5,to:10,lastHits:31,netWorth:4700,xp:5100,farmGain:2600,deaths:0,state:"surge" as const,note:"ریتم Farm بالاتر از میانه"},{from:10,to:20,lastHits:46,netWorth:8300,xp:9200,farmGain:3600,deaths:1,state:"setback" as const,note:"یک Death با افت Farm هم‌زمان است"}], note: "ریتم Farm از Timeline واقعی استخراج و با Deathهای همان بازه تفسیر می‌شود." },
    objectives: { availability: "partial" as const, towerDamage: profile ? 2_756 : 1_400 + playerIndex * 210, roshanKills: profile ? 1 : 0, towerKills: profile ? 2 : 1, barracksKills: 0, conversionCount: profile ? 2 : 1,missedConversionCount:1,averageConversionDelaySeconds:74,events:[{type:"tower" as const,minute:20,label:"Tower",playerPresent:true,delayAfterFightSeconds:52,convertedFromFight:true},{type:"roshan" as const,minute:31,label:"Roshan",playerPresent:true,delayAfterFightSeconds:96,convertedFromFight:true}], note: "مشارکت در Objective و تبدیل Fight به فشار روی Map کنار هم نمایش داده می‌شوند." },
    utility: { availability: "partial" as const, observersPlaced: profile ? 2 : 4, sentriesPlaced: profile ? 3 : 5, observersDestroyed: profile ? 1 : 2, sentriesDestroyed: profile ? 1 : 1, averageObserverLifetimeSeconds: profile ? 278 : 221, observersDewardedEarly: profile ? 0 : 1,visionValue:84,objectiveWardCoverage:67, campsStacked: profile ? 4 : 2, smokeUses: profile ? 1 : 2,successfulSmokes:profile?1:1, dustUses: profile ? 2 : 1, gemPurchases: 0, invisThreat: "active" as const,invisThreats:["Riki · Ability Invis","Shadow Fiend · Shadow Blade"],naturalReveal:["Zeus"], firstThreatMinute: 6, firstDetectionMinute: profile ? 5 : 8, preparedBeforeThreat: profile,coverageGapMinutes:profile?0:2, teamDetectionScore: 82, individualContribution: profile ? 34 : 16,responsibilityScore:profile?65:90, note: "Riki از Level 6 تهدید Invis ایجاد می‌کند؛ Detection پیش از فعال‌شدن تهدید آماده شده است." },
    movement:{availability:"partial" as const,safeTerritoryPercent:profile?58:64,enemyTerritoryPercent:profile?26:18,combatPoints:8,objectivePoints:3,timedTrailPoints:12,note:"Territory share از Telemetry موجود محاسبه شده است."},
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
        readonly={false}
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
