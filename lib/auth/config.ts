export const SESSION_COOKIE = "dota_notes_v2_session";
export const STEAM_STATE_COOKIE = "dota_notes_steam_state";
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const STEAM_STATE_DURATION_SECONDS = 10 * 60;

export function getAppUrl() {
  const value = process.env.APP_URL?.trim();

  if (!value) {
    throw new Error("APP_URL is not configured");
  }

  const url = new URL(value);

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_URL must contain only the site origin");
  }

  return url.origin;
}

export function useSecureCookies() {
  return getAppUrl().startsWith("https://");
}
