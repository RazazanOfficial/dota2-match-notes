import { fetchStratzGraphqlOnce, fetchStratzMatchOnce } from "./client";
import { getStratzConfig } from "./config";
import { StratzError } from "./errors";
import { reserveStratzRequestSlot } from "./rate-limit";

const IMMEDIATE_RETRY_CODES = new Set([
  "stratz_timeout",
  "stratz_unavailable",
  "stratz_upstream_error",
]);

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function shouldImmediatelyRetryStratz(error: unknown) {
  return error instanceof StratzError && IMMEDIATE_RETRY_CODES.has(error.code);
}

export async function fetchStratzMatch(matchId: number) {
  const config = getStratzConfig();
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    await reserveStratzRequestSlot(config.minRequestIntervalMs);
    try {
      return await fetchStratzMatchOnce(matchId);
    } catch (error) {
      lastError = error;
      if (
        attempt >= config.maxAttempts
        || !shouldImmediatelyRetryStratz(error)
      ) {
        throw error;
      }
      await sleep(config.retryDelayMs);
    }
  }

  throw lastError;
}

export async function fetchStratzGraphql(query: string, operationName: string) {
  const config = getStratzConfig();
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    await reserveStratzRequestSlot(config.minRequestIntervalMs);
    try {
      return await fetchStratzGraphqlOnce(query, operationName);
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxAttempts || !shouldImmediatelyRetryStratz(error)) throw error;
      await sleep(config.retryDelayMs);
    }
  }
  throw lastError;
}

export async function fetchStratzMatches(matchIds: number[]) {
  const matches = [];
  for (const matchId of matchIds) {
    matches.push(await fetchStratzMatch(matchId));
  }
  return matches;
}
