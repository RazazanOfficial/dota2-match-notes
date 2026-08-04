import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSteamLoginUrl,
  buildSteamReturnUrl,
  extractSteamId,
  steamIdToAccountId,
  STEAM_OPENID_ENDPOINT,
} from "../lib/auth/steam";

const ORIGINAL_APP_URL = process.env.APP_URL;
const EXAMPLE_STEAM_ID = "76561197960265729";

describe("Steam OpenID", () => {
  beforeEach(() => {
    process.env.APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = ORIGINAL_APP_URL;
  });

  it("builds a Steam login request with a state-bound callback", () => {
    const state = "test-state";
    const loginUrl = buildSteamLoginUrl(state);

    expect(loginUrl.origin + loginUrl.pathname).toBe(STEAM_OPENID_ENDPOINT);
    expect(loginUrl.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(loginUrl.searchParams.get("openid.realm")).toBe("http://localhost:3000");
    expect(loginUrl.searchParams.get("openid.return_to")).toBe(
      buildSteamReturnUrl(state).toString(),
    );
  });

  it("extracts only matching Steam claimed identities", () => {
    const claimedId = `https://steamcommunity.com/openid/id/${EXAMPLE_STEAM_ID}`;
    const params = new URLSearchParams({
      "openid.claimed_id": claimedId,
      "openid.identity": claimedId,
    });

    expect(extractSteamId(params)).toBe(EXAMPLE_STEAM_ID);

    params.set("openid.identity", `${claimedId}0`);
    expect(() => extractSteamId(params)).toThrow("invalid claimed identity");
  });

  it("converts a SteamID64 to the OpenDota account id", () => {
    expect(steamIdToAccountId(EXAMPLE_STEAM_ID)).toBe(1);
  });
});
