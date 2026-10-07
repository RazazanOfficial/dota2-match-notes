export const PLAYER_SEARCH_MIN_LENGTH = 2;
export const PLAYER_SEARCH_MAX_LENGTH = 64;
export const PLAYER_SEARCH_RESULT_LIMIT = 8;

export function normalizePlayerSearchQuery(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}
