import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStratzDiagnostics } from "../lib/stratz/client";
import { getStratzConfig } from "../lib/stratz/config";
import { buildStratzMatchDiagnostics, roleFromStratzPosition } from "../lib/stratz/diagnostics";
import { stratzDiagnosticsQuerySchema } from "../lib/stratz/validation";

const ENV_NAMES = [
  "STRATZ_API_URL",
  "STRATZ_API_TOKEN",
  "STRATZ_TIMEOUT_MS",
  "STRATZ_MAX_RESPONSE_BYTES",
  "STRATZ_DIAGNOSTICS_ENABLED",
] as const;
const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

beforeEach(() => {
  process.env.STRATZ_API_URL = "https://stratz.example.test/graphql/";
  process.env.STRATZ_API_TOKEN = "server-only-token";
  process.env.STRATZ_TIMEOUT_MS = "10000";
  process.env.STRATZ_MAX_RESPONSE_BYTES = "2097152";
  process.env.STRATZ_DIAGNOSTICS_ENABLED = "true";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("STRATZ configuration", () => {
  it("keeps the token server-side and normalizes limits", () => {
    expect(getStratzConfig()).toEqual({
      endpoint: "https://stratz.example.test/graphql",
      token: "server-only-token",
      timeoutMs: 10_000,
      maxResponseBytes: 2_097_152,
      diagnosticsEnabled: true,
    });
  });

  it("requires a token", () => {
    delete process.env.STRATZ_API_TOKEN;
    expect(() => getStratzConfig()).toThrow("Missing env: STRATZ_API_TOKEN");
  });
});

describe("STRATZ diagnostics client", () => {
  it("accepts at most three unique safe Match IDs", () => {
    expect(stratzDiagnosticsQuerySchema.parse({ matchIds: "100, 200,100" })).toEqual({
      matchIds: [100, 200],
    });
    expect(() => stratzDiagnosticsQuerySchema.parse({ matchIds: "1,2,3,4" })).toThrow();
  });

  it("requests exact match fields with bearer authentication and the required user agent", async () => {
    const matchId = 8_954_423_810;
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      data: {
        match0: {
          id: matchId,
          parsedDateTime: 1_787_000_000,
          statsDateTime: 1_787_000_100,
          players: [{ steamAccountId: 988_195_076, playerSlot: 0, heroId: 35, position: "POSITION_2", role: "CORE", roleBasic: "CORE" }],
          pickBans: [{ isPick: false, heroId: 80, bannedHeroId: 34, order: 1, isRadiant: true, playerIndex: 0, wasBannedSuccessfully: true, isCaptain: false }],
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchStratzDiagnostics([matchId]);
    expect(result[0]?.match?.players?.[0]?.position).toBe("POSITION_2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://stratz.example.test/graphql");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer server-only-token");
    expect(headers.get("User-Agent")).toBe("STRATZ_API");
    const body = JSON.parse(String(init.body)) as { query: string };
    expect(body.query).toContain(`match0: match(id: ${matchId})`);
    expect(body.query).not.toContain("server-only-token");
  });

  it("maps only explicit positions and preserves both ban hero fields", () => {
    expect(roleFromStratzPosition("POSITION_5")).toBe("hard_support");
    expect(roleFromStratzPosition("UNKNOWN")).toBeNull();
    const result = buildStratzMatchDiagnostics(100, {
      id: 100,
      parsedDateTime: 123,
      players: [{ steamAccountId: 42, heroId: 35, position: "POSITION_2" }],
      pickBans: [{ isPick: false, heroId: 80, bannedHeroId: 34, order: 2, wasBannedSuccessfully: true }],
    }, 42);
    expect(result).toMatchObject({
      found: true,
      player: { normalizedRole: "mid_lane" },
      banEvents: [{ nominatedHero: { heroId: 80 }, bannedHero: { heroId: 34 }, effectiveHero: { heroId: 34 } }],
    });
  });

  it("does not hide GraphQL schema errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      data: null,
      errors: [{ message: "Cannot query field" }],
    })));
    await expect(fetchStratzDiagnostics([100])).rejects.toMatchObject({
      code: "stratz_graphql_error",
    });
  });
});
