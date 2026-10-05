export const SESSION_COOKIE = "dota_notes_v2_session";
export const STEAM_STATE_COOKIE = "dota_notes_steam_state";
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const STEAM_STATE_DURATION_SECONDS = 10 * 60;
export const DESKTOP_AUTH_CODE_DURATION_SECONDS = 90;

export function getAppUrl() {
  const value = process.env.APP_URL?.trim();

  if (!value) {
    throw new Error("APP_URL is not configured");
  }

  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_URL must contain only the site origin");
  }

  return url.origin;
}

/** Public API origin can differ from the intro site's origin. */
export function getApiPublicUrl() {
  const value = process.env.API_PUBLIC_ORIGIN?.trim();
  if (!value) return getAppUrl();
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("API_PUBLIC_ORIGIN must contain only the API origin");
  }
  return url.origin;
}

export function useSecureCookies() {
  return getApiPublicUrl().startsWith("https://");
}
