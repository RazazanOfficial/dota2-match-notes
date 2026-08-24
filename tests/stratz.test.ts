import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStratzMatchOnce } from "../lib/stratz/client";
import { getStratzConfig } from "../lib/stratz/config";
import {
  buildStratzEnrichment,
  roleFromStratzPosition,
} from "../lib/stratz/enrichment";
import { StratzError } from "../lib/stratz/errors";
import { shouldImmediatelyRetryStratz } from "../lib/stratz/gateway";
import { nextStratzReservationAt } from "../lib/stratz/rate-limit";
import { stratzDiagnosticsQuerySchema } from "../lib/stratz/validation";

const ENV_NAMES = [
  "STRATZ_API_URL",
  "STRATZ_API_TOKEN",
  "STRATZ_DIRECT_IP",
  "STRATZ_TIMEOUT_MS",
  "STRATZ_MAX_RESPONSE_BYTES",
  "STRATZ_DIAGNOSTICS_ENABLED",
  "STRATZ_RETRY_DELAY_MS",
  "STRATZ_MAX_ATTEMPTS",
  "STRATZ_MIN_REQUEST_INTERVAL_MS",
  "STRATZ_BACKFILL_ON_MANUAL_SYNC",
  "STRATZ_INLINE_PROCESS_BATCH_SIZE",
  "STRATZ_PROCESS_BATCH_SIZE",
  "STRATZ_STALE_LOCK_SECONDS",
  "STRATZ_JOB_MAX_ATTEMPTS",
  "STRATZ_JOB_RETRY_BASE_SECONDS",
] as const;
const originalEnv = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  process.env.STRATZ_API_URL = "https://stratz.example.test/graphql/";
  process.env.STRATZ_API_TOKEN = "server-only-token";
  process.env.STRATZ_DIRECT_IP = "104.26.8.64";
  process.env.STRATZ_TIMEOUT_MS = "10000";
  process.env.STRATZ_MAX_RESPONSE_BYTES = "2097152";
  process.env.STRATZ_DIAGNOSTICS_ENABLED = "true";
  process.env.STRATZ_RETRY_DELAY_MS = "2000";
  process.env.STRATZ_MAX_ATTEMPTS = "2";
  process.env.STRATZ_MIN_REQUEST_INTERVAL_MS = "1000";
  process.env.STRATZ_BACKFILL_ON_MANUAL_SYNC = "false";
  process.env.STRATZ_INLINE_PROCESS_BATCH_SIZE = "3";
  process.env.STRATZ_PROCESS_BATCH_SIZE = "10";
  process.env.STRATZ_STALE_LOCK_SECONDS = "900";
  process.env.STRATZ_JOB_MAX_ATTEMPTS = "6";
  process.env.STRATZ_JOB_RETRY_BASE_SECONDS = "120";
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("STRATZ configuration", () => {
  it("uses one pinned destination and conservative request policy", () => {
    expect(getStratzConfig()).toMatchObject({
      endpoint: "https://stratz.example.test/graphql",
      token: "server-only-token",
      directIp: "104.26.8.64",
      maxAttempts: 2,
      retryDelayMs: 2_000,
      minRequestIntervalMs: 1_000,
      backfillOnManualSync: false,
      inlineProcessBatchSize: 3,
      processBatchSize: 10,
      jobMaxAttempts: 6,
    });
  });

  it("requires both the token and one public IPv4 destination", () => {
    delete process.env.STRATZ_API_TOKEN;
    expect(() => getStratzConfig()).toThrow("Missing env: STRATZ_API_TOKEN");
    process.env.STRATZ_API_TOKEN = "server-only-token";
    process.env.STRATZ_DIRECT_IP = "10.0.0.1";
    expect(() => getStratzConfig()).toThrow("Invalid env: STRATZ_DIRECT_IP");
  });

  it("rejects request spacing below one second and invalid booleans", () => {
    process.env.STRATZ_MIN_REQUEST_INTERVAL_MS = "999";
    expect(() => getStratzConfig()).toThrow(
      "Invalid env: STRATZ_MIN_REQUEST_INTERVAL_MS",
    );
    process.env.STRATZ_MIN_REQUEST_INTERVAL_MS = "1000";
    process.env.STRATZ_BACKFILL_ON_MANUAL_SYNC = "yes";
    expect(() => getStratzConfig()).toThrow(
      "Invalid env: STRATZ_BACKFILL_ON_MANUAL_SYNC",
    );
  });
});

describe("STRATZ request policy", () => {
  it("reserves request starts at least one second apart", () => {
    const now = new Date("2026-08-23T12:00:00.500Z");
    expect(nextStratzReservationAt(now, null, 1_000)).toEqual(now);
    expect(
      nextStratzReservationAt(
        now,
        new Date("2026-08-23T12:00:00.000Z"),
        1_000,
      ),
    ).toEqual(new Date("2026-08-23T12:00:01.000Z"));
  });

  it("retries only transient connection and upstream failures immediately", () => {
    expect(
      shouldImmediatelyRetryStratz(
        new StratzError(502, "stratz_upstream_error", "temporary"),
      ),
    ).toBe(true);
    expect(
      shouldImmediatelyRetryStratz(
        new StratzError(502, "stratz_edge_blocked", "blocked"),
      ),
    ).toBe(false);
    expect(
      shouldImmediatelyRetryStratz(
        new StratzError(429, "stratz_rate_limited", "limited"),
      ),
    ).toBe(false);
  });
});

describe("STRATZ client and validation", () => {
  it("accepts at most three unique safe diagnostic Match IDs", () => {
    expect(
      stratzDiagnosticsQuerySchema.parse({ matchIds: "100, 200,100" }),
    ).toEqual({ matchIds: [100, 200] });
    expect(() =>
      stratzDiagnosticsQuerySchema.parse({ matchIds: "1,2,3,4" }),
    ).toThrow();
  });

  it("requests one match through the pinned destination with required headers", async () => {
    const matchId = 8_954_423_810;
    const transport = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          match0: {
            id: matchId,
            parsedDateTime: 1_787_000_000,
            statsDateTime: 1_787_000_100,
            players: [
              {
                steamAccountId: 988_195_076,
                playerSlot: 0,
                heroId: 35,
                position: "POSITION_2",
                role: "CORE",
                roleBasic: "CORE",
              },
            ],
            pickBans: [
              {
                isPick: false,
                heroId: 80,
                bannedHeroId: 34,
                order: 1,
                wasBannedSuccessfully: true,
              },
            ],
          },
        },
      }),
    );

    const result = await fetchStratzMatchOnce(matchId, transport);
    expect(result.match?.players?.[0]?.position).toBe("POSITION_2");
    const [endpoint, init, destination] = transport.mock.calls[0];
    expect(endpoint).toBe("https://stratz.example.test/graphql");
    expect(destination).toBe("104.26.8.64");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer server-only-token");
    expect(headers.get("User-Agent")).toBe("STRATZ_API");
    const body = JSON.parse(String(init.body)) as { query: string };
    expect(body.query).toContain(`match0: match(id: ${matchId})`);
    expect(body.query).not.toContain("server-only-token");
  });

  it("maps explicit position and authoritative successful bans", () => {
    expect(roleFromStratzPosition("POSITION_5")).toBe("hard_support");
    expect(roleFromStratzPosition("UNKNOWN")).toBeNull();
    expect(
      buildStratzEnrichment({
        steamAccountId: 42,
        expectedHeroId: 35,
        heroPoolEligible: true,
        match: {
          id: 100,
          parsedDateTime: 123,
          players: [
            { steamAccountId: 42, heroId: 35, position: "POSITION_2" },
            { steamAccountId: 43, heroId: 2, playerSlot: 1 },
            { steamAccountId: 44, heroId: 3, playerSlot: 128 },
          ],
          pickBans: [
            {
              isPick: false,
              heroId: 80,
              bannedHeroId: 34,
              order: 2,
              wasBannedSuccessfully: true,
            },
            {
              isPick: false,
              heroId: 1,
              bannedHeroId: 1,
              order: 3,
              wasBannedSuccessfully: false,
            },
          ],
        },
      }),
    ).toMatchObject({
      role: "mid_lane",
      picks: [
        { heroId: 2, heroName: "Axe", team: 0 },
        { heroId: 3, heroName: "Bane", team: 1 },
      ],
      bans: [{ heroId: 34, heroName: "Tinker" }],
    });
  });

  it("distinguishes an intermittent HTML 503 from a Cloudflare challenge", async () => {
    const unavailable = vi
      .fn()
      .mockResolvedValue(
        new Response("<html>The service is unavailable.</html>", {
          status: 503,
          headers: { "content-type": "text/html", "cf-ray": "outage-ray" },
        }),
      );
    await expect(fetchStratzMatchOnce(100, unavailable)).rejects.toMatchObject({
      code: "stratz_upstream_error",
      details: { destinationIp: "104.26.8.64", cfRay: "outage-ray" },
    });

    const challenge = vi.fn().mockResolvedValue(
      new Response("<html><title>Just a moment...</title></html>", {
        status: 403,
        headers: { "content-type": "text/html", "cf-ray": "challenge-ray" },
      }),
    );
    await expect(fetchStratzMatchOnce(100, challenge)).rejects.toMatchObject({
      code: "stratz_edge_blocked",
      details: { destinationIp: "104.26.8.64", cfRay: "challenge-ray" },
    });
  });

  it("keeps the STRATZ single-source-IP restriction explicit", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response("You cannot use different IP Addresses when using the API.", {
        status: 403,
        headers: { "cf-ray": "example-ray" },
      }),
    );
    await expect(fetchStratzMatchOnce(100, transport)).rejects.toMatchObject({
      code: "stratz_ip_conflict",
      details: { destinationIp: "104.26.8.64", cfRay: "example-ray" },
    });
  });
});
