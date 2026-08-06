import { afterEach, describe, expect, it, vi } from "vitest";
import {
  restorePlayer,
  saveDay,
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
      user: { handle: "steam_123" },
    });

    await expect(restorePlayer()).resolves.toEqual({
      mode: "player",
      username: "steam_123",
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
          legacyBans: "",
          role: "safe_lane",
          queueType: "role_selected",
          notes: "client test",
          result: "win",
          createdAt: "2026-08-04T12:00:00.000Z",
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
});
