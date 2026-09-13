import { afterEach, describe, expect, it, vi } from "vitest";
import {
  restorePlayer,
  saveDay,
  searchPlayers,
  syncPlayerMatches,
  viewCoach,
  viewPlayer,
} from "../lib/api";
import type { Day } from "../lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json(body, { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("journal client API", () => {
  it("restores the Steam session using its public handle", async () => {
    mockFetch({
      authenticated: true,
      user: {
        handle: "steam_123",
        displayName: "Player",
        avatarUrl: "https://example.test/avatar.jpg",
        isSuperAdmin: true,
      },
    });

    await expect(restorePlayer()).resolves.toEqual({
      mode: "player",
      username: "steam_123",
      displayName: "Player",
      avatarUrl: "https://example.test/avatar.jpg",
      isSuperAdmin: true,
    });
  });

  it("returns null for an anonymous browser session", async () => {
    mockFetch({ authenticated: false });
    await expect(restorePlayer()).resolves.toBeNull();
  });

  it("loads a public profile for only the requested range", async () => {
    const fetchMock = mockFetch({
      ok: true,
      profile: { username: "steam_123", days: {} },
    });

    const profile = await viewCoach("steam_123", "2026-08-01", "2026-08-07");

    expect(profile.username).toBe("steam_123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/journal/users/steam_123?from=2026-08-01&to=2026-08-07",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("sends encoded realtime player search terms", async () => {
    const fetchMock = mockFetch({
      ok: true,
      results: [
        {
          steamId: "76561198948460804",
          steamAccountId: 988195076,
          handle: "steam_988195076",
          displayName: "MeriJ",
          avatarUrl: null,
        },
      ],
    });

    await expect(searchPlayers("meri j")).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/search?q=meri+j",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("serializes a day for the PostgreSQL journal endpoint", async () => {
    const fetchMock = mockFetch({
      ok: true,
      profile: { username: "steam_123", days: {} },
    });
    const day: Day = {
      completed: false,
      matches: [
        {
          id: "9eb718f9-8eee-40ec-bc62-b7f43329dce7",
          number: 1,
          heroId: 1,
          heroName: "Anti-Mage",
          bans: [{ id: 2, slug: "axe", name: "Axe" }],
          picks: [],
          legacyBans: "",
          role: "safe_lane",
          queueType: "role_selected",
          notes: "client test",
          positivePoints: [],
          negativePoints: [],
          result: "win",
          createdAt: "2026-08-04T12:00:00.000Z",
          source: "opendota",
          dotaMatchId: "8981928176",
          kills: 8,
        },
      ],
    };

    await saveDay(
      { mode: "player", username: "steam_123" },
      "2026-08-04",
      day,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toMatchObject({
      completed: false,
      matches: {
        "9eb718f9-8eee-40ec-bc62-b7f43329dce7": {
          heroId: 1,
          banIds: [2],
          notes: "client test",
        },
      },
    });
    const serializedMatch = JSON.parse(String(init.body)).matches[
      "9eb718f9-8eee-40ec-bc62-b7f43329dce7"
    ];
    expect(serializedMatch).not.toHaveProperty("dotaMatchId");
    expect(serializedMatch).not.toHaveProperty("kills");
  });

  it("surfaces the Persian API error message", async () => {
    mockFetch(
      {
        ok: false,
        error: { code: "invalid_date_range", message: "بازه تاریخ نامعتبر است" },
      },
      400,
    );

    await expect(
      viewPlayer("steam_123", "bad-date", "2026-08-07"),
    ).rejects.toThrow("بازه تاریخ نامعتبر است");
  });

  it("sends an explicit range and import mode for manual match retrieval", async () => {
    const fetchMock = mockFetch({
      ok: true,
      sync: {
        checked: 0, alreadyImported: 0, dismissedByUser: 0, imported: [], failed: [], deferred: 0, ignoredOlder: 0,
        registeredAt: "2026-09-01T00:00:00.000Z", trackedFrom: "2026-09-07T00:00:00.000Z", nextAllowedAt: "2026-09-13T12:05:00.000Z",
        request: { scope: "week", from: "2026-09-07", to: "2026-09-13", mode: "basic" },
        analysis: { tokenCostPerMatch: 10, totalTokenCost: 0, queued: 0, alreadyReady: 0, alreadyQueued: 0, failed: 0, skippedOld: 0, skippedOldDays: [] },
      },
    });
    await syncPlayerMatches({ scope: "week", from: "2026-09-07", to: "2026-09-13", mode: "basic" });
    const [,init]=fetchMock.mock.calls[0] as [string,RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ scope: "week", from: "2026-09-07", to: "2026-09-13", mode: "basic" });
  });
});
