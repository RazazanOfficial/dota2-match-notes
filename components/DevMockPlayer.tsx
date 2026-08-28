"use client";

import { useState } from "react";
import { heroById } from "@/data/heroes";
import type { Match, MatchParticipant } from "@/lib/types";
import MatchDialog from "./MatchDialog";

const HERO_IDS = [48, 2, 1, 14, 26, 74, 86, 41, 35, 129];
const PLAYER_SLOTS = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
const NAMES = ["Meri-J", "Nova", "Aster", "Rook", "Mildon", "Inanis", "Vex", "Mira", "Orion", "حساب خصوصی"];
const ITEM_SETS = [
  [108, 50, 63, 139, 116, 147, 38, 40, 46],
  [1, 48, 11, 36, 112, 127, 16, 20, 0],
  [29, 41, 63, 116, 147, 160, 0, 0, 0],
  [79, 90, 100, 110, 135, 152, 34, 0, 0],
  [46, 48, 65, 96, 108, 141, 0, 0, 0],
];

const participants = HERO_IDS.map((heroId, index): MatchParticipant => {
  const hero = heroById(heroId)!;
  const items = ITEM_SETS[index % ITEM_SETS.length];
  return {
    playerSlot: PLAYER_SLOTS[index],
    accountId: index === 9 ? null : 900_000_000 + index,
    personName: NAMES[index],
    heroId,
    heroName: hero.name,
    team: index < 5 ? "radiant" : "dire",
    level: 30 - (index % 6),
    kills: 15 - (index % 7),
    deaths: 4 + (index % 8),
    assists: 18 + index,
    lastHits: 438 - index * 27,
    denies: 12 - (index % 6),
    goldPerMinute: 731 - index * 29,
    xpPerMinute: 842 - index * 23,
    netWorth: 36_450 - index * 1_320,
    heroDamage: 48_200 - index * 1_870,
    towerDamage: 6_130 - index * 310,
    heroHealing: index % 3 === 0 ? index * 420 : 0,
    itemIds: items.slice(0, 6).map((id) => id || null),
    backpackItemIds: items.slice(6, 9).map((id) => id || null),
    neutralItemId: [289, 358, 376, 287, 304][index % 5],
    neutralEnhancementId: null,
    hasAghanimsScepter: index % 2 === 0,
    hasAghanimsShard: index % 3 === 0,
    isProfilePlayer: index === 0,
    inRolePool: index === 0,
  };
});

const bans = [3, 8, 13, 17, 22, 25, 30, 31, 33, 37, 42, 44]
  .map((id) => heroById(id))
  .filter((hero): hero is NonNullable<typeof hero> => Boolean(hero));

const MOCK_MATCH: Match = {
  id: "dev-mock-match",
  number: 1,
  heroId: 48,
  heroName: heroById(48)?.name || "Luna",
  bans,
  picks: [],
  role: "safe_lane",
  queueType: "role_selected",
  notes: "",
  positivePoints: ["کنترل مناسب Runeها", "تصمیم درست برای Roshan"],
  negativePoints: ["یک درگیری بدون Vision"],
  result: "win",
  createdAt: "2026-08-28T12:00:00.000Z",
  source: "opendota",
  dotaMatchId: "8967968620",
  durationSeconds: 2_945,
  gameModeId: 22,
  gameModeName: "All Draft",
  lobbyTypeId: 7,
  lobbyTypeName: "Ranked",
  radiantWin: true,
  radiantScore: 48,
  direScore: 31,
  participants,
};

export default function DevMockPlayer() {
  const [open, setOpen] = useState(true);
  return (
    <main className="dev-mock-page">
      <section className="dev-mock-profile">
        <img src="/logos/logo_128x128.png" alt="" />
        <div><span lang="en">Dota2Notes</span><h1 lang="en">Meri-J</h1></div>
        <button type="button" className="primary-button" onClick={() => setOpen(true)}>مشاهده مچ</button>
      </section>
      <MatchDialog
        open={open}
        readonly
        dateLabel="امروز"
        match={MOCK_MATCH}
        nextNumber={2}
        onClose={() => setOpen(false)}
        onSave={() => undefined}
        onDelete={() => undefined}
      />
    </main>
  );
}
