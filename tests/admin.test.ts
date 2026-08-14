import { afterEach, describe, expect, it } from "vitest";
import {
  isSuperAdminSteamId,
  parseSuperAdminSteamIds,
} from "../lib/admin/config";
import {
  listUsersQuerySchema,
  normalizeSteamIdentifier,
  provisionUserInputSchema,
} from "../lib/admin/validation";

const ORIGINAL_SUPER_ADMIN_IDS = process.env.SUPER_ADMIN_STEAM_IDS;

afterEach(() => {
  if (ORIGINAL_SUPER_ADMIN_IDS === undefined) {
    delete process.env.SUPER_ADMIN_STEAM_IDS;
  } else {
    process.env.SUPER_ADMIN_STEAM_IDS = ORIGINAL_SUPER_ADMIN_IDS;
  }
});

describe("Super Admin access", () => {
  it("parses and deduplicates the SteamID64 allowlist", () => {
    const ids = parseSuperAdminSteamIds(
      "76561197960265729, 76561198948460804,76561197960265729",
    );

    expect([...ids]).toEqual([
      "76561197960265729",
      "76561198948460804",
    ]);
  });

  it("rejects malformed allowlist entries", () => {
    expect(() => parseSuperAdminSteamIds("76561197960265729,1234")).toThrow(
      "SUPER_ADMIN_STEAM_IDS",
    );
  });

  it("uses the environment allowlist as the Super Admin source", () => {
    process.env.SUPER_ADMIN_STEAM_IDS = "76561198948460804";
    expect(isSuperAdminSteamId("76561198948460804")).toBe(true);
    expect(isSuperAdminSteamId("76561197960265729")).toBe(false);
  });
});

describe("admin user validation", () => {
  it("accepts either an account id or its SteamID64", () => {
    expect(normalizeSteamIdentifier("988195076")).toEqual({
      steamId: "76561198948460804",
      steamAccountId: 988195076,
    });
    expect(normalizeSteamIdentifier("76561198948460804")).toEqual({
      steamId: "76561198948460804",
      steamAccountId: 988195076,
    });
  });

  it("rejects ambiguous identifiers and extra body fields", () => {
    expect(() => normalizeSteamIdentifier("steam_988195076")).toThrow();
    expect(
      provisionUserInputSchema.safeParse({
        steamIdentifier: "988195076",
        isAdmin: true,
      }).success,
    ).toBe(false);
  });

  it("bounds list pagination", () => {
    expect(listUsersQuerySchema.parse({})).toEqual({
      query: "",
      limit: 25,
      offset: 0,
    });
    expect(
      listUsersQuerySchema.safeParse({ limit: "101", offset: "0" }).success,
    ).toBe(false);
  });
});
