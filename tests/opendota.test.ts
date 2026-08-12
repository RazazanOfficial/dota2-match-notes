import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOpenDotaMatch } from "../lib/opendota/client";
import { getOpenDotaConfig } from "../lib/opendota/config";
import { OpenDotaError } from "../lib/opendota/errors";
import {
  openDotaSyncInputSchema,
  parseOpenDotaMatch,
} from "../lib/opendota/validation";

const OPENDOTA_ENV = [
  "OPENDOTA_API_BASE_URL",
  "OPENDOTA_API_KEY",
  "OPENDOTA_TIMEOUT_MS",
  "OPENDOTA_MAX_RESPONSE_BYTES",
  "OPENDOTA_MANUAL_SYNC_COOLDOWN_SECONDS",
  "OPENDOTA_MINUTE_REQUEST_LIMIT",
  "OPENDOTA_DAILY_REQUEST_LIMIT",
] as const;
const originalEnv = Object.fromEntries(
  OPENDOTA_ENV.map((name) => [name, process.env[name]]),
);

const matchPayload = {
  match_id: 8_981_928_176,
  start_time: 1_786_000_000,
  duration: 2_400,
  radiant_win: true,
  game_mode: 22,
  lobby_type: 7,
  players: [
    {
      account_id: 988_195_076,
      player_slot: 0,
      hero_id: 1,
      kills: 8,
      deaths: 2,
      assists: 16,
      gold_per_min: 650,
      xp_per_min: 720,
      net_worth: 30_000,
      hero_damage: 40_000,
      tower_damage: 5_000,
    },
  ],
};

beforeEach(() => {
  process.env.OPENDOTA_API_BASE_URL = "https://api.example.test/api/";
  process.env.OPENDOTA_API_KEY = "server-secret";
  process.env.OPENDOTA_TIMEOUT_MS = "10000";
  process.env.OPENDOTA_MAX_RESPONSE_BYTES = "8388608";
  process.env.OPENDOTA_MANUAL_SYNC_COOLDOWN_SECONDS = "300";
  process.env.OPENDOTA_MINUTE_REQUEST_LIMIT = "50";
  process.env.OPENDOTA_DAILY_REQUEST_LIMIT = "2900";
});

afterEach(() => {
  vi.unstubAllGlobals();
  OPENDOTA_ENV.forEach((name) => {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

describe("OpenDota configuration", () => {
  it("normalizes server-only API settings", () => {
    expect(getOpenDotaConfig()).toEqual({
      baseUrl: "https://api.example.test/api",
      apiKey: "server-secret",
      timeoutMs: 10_000,
      maxResponseBytes: 8_388_608,
      manualSyncCooldownSeconds: 300,
      minuteRequestLimit: 50,
      dailyRequestLimit: 2_900,
    });
  });

  it("rejects a non-HTTPS upstream", () => {
    process.env.OPENDOTA_API_BASE_URL = "http://api.example.test/api";
    expect(() => getOpenDotaConfig()).toThrow(
      "Invalid env: OPENDOTA_API_BASE_URL",
    );
  });
});

describe("OpenDota input and response validation", () => {
  it("accepts a Match ID as a JSON-safe decimal string", () => {
    expect(
      openDotaSyncInputSchema.parse({ dotaMatchId: "8981928176" }),
    ).toEqual({ dotaMatchId: 8_981_928_176 });
  });

  it("validates the match and player statistics", () => {
    expect(
      parseOpenDotaMatch(matchPayload, matchPayload.match_id).players[0],
    ).toMatchObject({ account_id: 988_195_076, hero_id: 1, kills: 8 });
  });

  it("rejects a response for a different Match ID", () => {
    expect(() => parseOpenDotaMatch(matchPayload, 1)).toThrowError(
      OpenDotaError,
    );
  });
});

describe("OpenDota HTTP client", () => {
  it("fetches one match and keeps the API key server-side", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(matchPayload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOpenDotaMatch(matchPayload.match_id)).resolves.toMatchObject({
      match_id: matchPayload.match_id,
      radiant_win: true,
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe(
      `https://api.example.test/api/matches/${matchPayload.match_id}`,
    );
    expect(url.searchParams.get("api_key")).toBe("server-secret");
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
  });

  it("maps OpenDota rate limiting to a safe application error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "45" },
        }),
      ),
    );

    await expect(fetchOpenDotaMatch(matchPayload.match_id)).rejects.toMatchObject({
      code: "opendota_rate_limited",
      retryAfterSeconds: 45,
    });
  });

  it("rejects a response larger than the configured limit", async () => {
    process.env.OPENDOTA_MAX_RESPONSE_BYTES = "65536";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          headers: { "Content-Length": "65537" },
        }),
      ),
    );

    await expect(fetchOpenDotaMatch(matchPayload.match_id)).rejects.toMatchObject({
      code: "opendota_response_too_large",
    });
  });
});
