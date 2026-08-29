"use client";

import MatchDialog from "./MatchDialog";
import type { DotaTeam, Match, MatchParticipant } from "@/lib/types";

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
};

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
