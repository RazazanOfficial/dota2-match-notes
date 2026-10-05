import { getAppUrl } from "./config";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

const OPENID_NAMESPACE = "http://specs.openid.net/auth/2.0";
const OPENID_IDENTIFIER_SELECT = `${OPENID_NAMESPACE}/identifier_select`;
const STEAM_ID_BASE = 76_561_197_960_265_728n;
const MAX_ACCOUNT_ID = 4_294_967_295n;

export interface SteamProfile {
  steamId: string;
  accountId: number;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
}

interface SteamPlayerSummaryResponse {
  response?: {
    players?: Array<{
      steamid?: string;
      personaname?: string;
      profileurl?: string;
      avatarfull?: string;
    }>;
  };
}

export function steamIdToAccountId(steamId: string) {
  if (!/^\d{17}$/.test(steamId)) {
    throw new Error("Steam returned an invalid SteamID");
  }

  const accountId = BigInt(steamId) - STEAM_ID_BASE;

  if (accountId < 0n || accountId > MAX_ACCOUNT_ID) {
    throw new Error("SteamID is outside the supported account range");
  }

  return Number(accountId);
}

export function steamAccountIdToSteamId(accountId: string | number) {
  const normalized = String(accountId).trim();
  if (!/^\d{1,10}$/.test(normalized)) {
    throw new Error("Steam Account ID is invalid");
  }

  const value = BigInt(normalized);
  if (value < 0n || value > MAX_ACCOUNT_ID) {
    throw new Error("Steam Account ID is outside the supported range");
  }

  return String(STEAM_ID_BASE + value);
}

export function buildSteamReturnUrl(state: string) {
  const returnUrl = new URL("/api/auth/steam/callback", getAppUrl());
  returnUrl.searchParams.set("state", state);
  return returnUrl;
}

export function buildSteamLoginUrl(state: string) {
  const loginUrl = new URL(STEAM_OPENID_ENDPOINT);

  loginUrl.searchParams.set("openid.ns", OPENID_NAMESPACE);
  loginUrl.searchParams.set("openid.mode", "checkid_setup");
  loginUrl.searchParams.set("openid.return_to", buildSteamReturnUrl(state).toString());
  loginUrl.searchParams.set("openid.realm", getAppUrl());
  loginUrl.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
  loginUrl.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);

  return loginUrl;
}

export function extractSteamId(params: URLSearchParams) {
  const claimedId = params.get("openid.claimed_id") || "";
  const identity = params.get("openid.identity") || "";
  const match = claimedId.match(
    /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/,
  );

  if (!match || identity !== claimedId) {
    throw new Error("Steam returned an invalid claimed identity");
  }

  return match[1];
}

export async function verifySteamOpenId(params: URLSearchParams, state: string) {
  if (params.get("openid.mode") !== "id_res") {
    throw new Error("Steam did not return a successful identity response");
  }

  if (params.get("openid.op_endpoint") !== STEAM_OPENID_ENDPOINT) {
    throw new Error("Steam returned an unexpected OpenID endpoint");
  }

  const expectedReturnUrl = buildSteamReturnUrl(state).toString();
  if (params.get("openid.return_to") !== expectedReturnUrl) {
    throw new Error("Steam returned an unexpected callback URL");
  }

  const verificationBody = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith("openid.")) {
      verificationBody.set(key, value);
    }
  }
  verificationBody.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: verificationBody,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Steam verification failed with status ${response.status}`);
  }

  const verification = Object.fromEntries(
    (await response.text())
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return separator === -1
          ? [line, ""]
          : [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );

  if (verification.is_valid !== "true") {
    throw new Error("Steam rejected the OpenID response signature");
  }

  return extractSteamId(params);
}

function fallbackSteamProfile(steamId: string): SteamProfile {
  const accountId = steamIdToAccountId(steamId);
  return {
    steamId,
    accountId,
    displayName: `Steam ${accountId}`,
    avatarUrl: null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}/`,
  };
}

async function requestSteamProfile(steamId: string) {
  const fallback = fallbackSteamProfile(steamId);
  const apiKey = process.env.STEAM_WEB_API_KEY?.trim();

  if (!apiKey) return null;

  const url = new URL(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamids", steamId);

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Steam profile request failed with status ${response.status}`);
  }

  const data = (await response.json()) as SteamPlayerSummaryResponse;
  const player = data.response?.players?.[0];

  if (!player || player.steamid !== steamId) return null;

  return {
    steamId,
    accountId: fallback.accountId,
    displayName: player.personaname?.trim() || fallback.displayName,
    avatarUrl: player.avatarfull?.trim() || null,
    profileUrl: player.profileurl?.trim() || fallback.profileUrl,
  } satisfies SteamProfile;
}

export async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  const fallback = fallbackSteamProfile(steamId);

  try {
    return (await requestSteamProfile(steamId)) || fallback;
  } catch (error) {
    console.error("Steam profile lookup failed", error);
    return fallback;
  }
}

export async function fetchSteamProfileRequired(steamId: string) {
  if (!process.env.STEAM_WEB_API_KEY?.trim()) {
    throw new Error("STEAM_WEB_API_KEY is required for admin user provisioning");
  }

  const profile = await requestSteamProfile(steamId);
  if (!profile) throw new Error("Steam profile was not found");
  return profile;
}
