import { describe, expect, it } from "vitest";
import {
  getWeekAnchorDate,
  getWeekDates,
  isValidUsername,
  mergeProfiles,
  normalizePublicHandle,
  normalizeProfile,
  sanitizeMatch,
  summarizeMatches,
  toDateKey,
} from "../lib/date";

describe("calendar", () => {
  it("builds a Saturday-to-Friday week", () => {
    expect(getWeekDates("2026-07-25", 0).map(toDateKey)).toEqual([
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]);
  });

  it("anchors week one to the signup week's Saturday", () => {
    expect(getWeekAnchorDate("2026-08-25")).toBe("2026-08-22");
  });
});

describe("profile migration", () => {
  it("maps legacy hero and bans fields without losing notes", () => {
    const profile = normalizeProfile({
      username: "player",
      days: {
        "2026-07-25": {
          completed: true,
          matches: {
            old: {
              id: "old",
              number: 1,
              hero: "Axe",
              bans: "Pudge",
              notes: "legacy note",
              result: "win",
            },
          },
        },
      },
    });
    const match = profile.days["2026-07-25"].matches[0];
    expect(match.heroName).toBe("Axe");
    expect(match.heroId).toBe(2);
    expect(match.legacyBans).toBe("Pudge");
    expect(match.notes).toBe("legacy note");
  });

  it("reads v2 ban IDs", () => {
    const match = sanitizeMatch({
      number: 2,
      heroId: 14,
      heroName: "Pudge",
      banIds: [2, 3],
      role: "off_lane",
      queueType: "role_selected",
      result: "loss",
    });
    expect(match.bans.map((hero) => hero.name)).toEqual(["Axe", "Bane"]);
  });

  it("keeps only valid manual Position overrides", () => {
    const match = sanitizeMatch({
      number: 2,
      heroId: 14,
      heroName: "Pudge",
      result: "loss",
      positionOverrides: { "0": 3, "128": 4, "5": 2, "129": 9, unsafe: 1 },
    });
    expect(match.positionOverrides).toEqual({ "0": 3, "128": 4 });
  });

  it("preserves read-only OpenDota fields for future UI rendering", () => {
    const match = sanitizeMatch({
      id: "11111111-1111-4111-8111-111111111111",
      number: 1,
      heroId: 11,
      heroName: "Shadow Fiend",
      result: "loss",
      source: "opendota",
      dotaMatchId: "8940973270",
      startedAt: "2026-08-11T18:56:07.000Z",
      durationSeconds: 2547,
      kills: 6,
      deaths: 9,
      assists: 11,
      gameModeId: 23,
      lobbyTypeId: 0,
      radiantWin: true,
      radiantScore: 48,
      direScore: 31,
      participants: [{
        playerSlot: 0,
        accountId: 988195076,
        personName: "Meraj",
        heroId: 11,
        heroName: "Shadow Fiend",
        team: "dire",
        level: 27,
        kills: 6,
        deaths: 9,
        assists: 11,
        lastHits: 250,
        denies: 8,
        goldPerMinute: 620,
        xpPerMinute: 700,
        netWorth: 25_000,
        heroDamage: 36_000,
        towerDamage: 2_000,
        heroHealing: 0,
        itemIds: [108, 50, 0, -1, null, "bad"],
        backpackItemIds: [38],
        neutralItemId: 289,
        neutralEnhancementId: 0,
        hasAghanimsScepter: true,
        hasAghanimsShard: false,
        isProfilePlayer: true,
      }],
    });

    expect(match).toMatchObject({
      source: "opendota",
      dotaMatchId: "8940973270",
      durationSeconds: 2547,
      kills: 6,
      deaths: 9,
      assists: 11,
      gameModeName: "Turbo",
      lobbyTypeName: "Normal",
      radiantWin: true,
      radiantScore: 48,
      direScore: 31,
    });
    expect(match.participants?.[0]).toMatchObject({
      team: "radiant",
      heroName: "Shadow Fiend",
      itemIds: [108, 50, null, null, null, null],
      backpackItemIds: [38, null, null],
    });
  });

  it("merges partial week responses without losing loaded days", () => {
    const first = normalizeProfile({
      username: "steam_123",
      days: { "2026-08-01": { completed: false, matches: {} } },
    });
    const second = normalizeProfile({
      username: "steam_123",
      days: { "2026-08-08": { completed: true, matches: {} } },
    });

    expect(Object.keys(mergeProfiles(first, second).days)).toEqual([
      "2026-08-01",
      "2026-08-08",
    ]);
  });
});

describe("summary and username", () => {
  it("summarizes wins and losses", () => {
    const matches = [
      sanitizeMatch({ number: 1, heroId: 2, heroName: "Axe", result: "win" }),
      sanitizeMatch({ number: 2, heroId: 3, heroName: "Bane", result: "loss" }),
    ];
    expect(summarizeMatches(matches)).toMatchObject({
      games: 2,
      wins: 1,
      losses: 1,
      winRate: 0.5,
    });
  });

  it("accepts only the supported username format", () => {
    expect(isValidUsername("meri_j.1")).toBe(true);
    expect(isValidUsername("bad name")).toBe(false);
    expect(isValidUsername("__proto__")).toBe(false);
  });

  it("accepts a Steam account id without the public handle prefix", () => {
    expect(normalizePublicHandle("988195076")).toBe("steam_988195076");
    expect(normalizePublicHandle("STEAM_988195076")).toBe("steam_988195076");
  });
});
