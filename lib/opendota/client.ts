import { getOpenDotaConfig } from "./config";
import { OpenDotaError } from "./errors";
import {
  parseOpenDotaMatch,
  parseOpenDotaRecentMatches,
} from "./validation";

function parseRetryAfter(value: string | null) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

export async function fetchOpenDotaJson(
  path: string,
  notFound: { code: string; message: string },
) {
  const config = getOpenDotaConfig();
  const url = new URL(`${config.baseUrl}/${path.replace(/^\/+/, "")}`);
  if (config.apiKey) url.searchParams.set("api_key", config.apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenDotaError(
        504,
        "opendota_timeout",
        "دریافت اطلاعات مچ‌ها بیش از حد طول کشید؛ دوباره تلاش کنید",
      );
    }
    throw new OpenDotaError(
      502,
      "opendota_unavailable",
      "اطلاعات مچ‌ها دریافت نشد؛ دوباره تلاش کنید",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new OpenDotaError(
      404,
      notFound.code,
      notFound.message,
    );
  }
  if (response.status === 429) {
    throw new OpenDotaError(
      429,
      "opendota_rate_limited",
      "درخواست‌های زیادی در حال بررسی است؛ کمی بعد دوباره تلاش کنید",
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
  if (!response.ok) {
    throw new OpenDotaError(
      502,
      "opendota_bad_status",
      "اطلاعات مچ‌ها فعلاً در دسترس نیست",
    );
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > config.maxResponseBytes) {
    throw new OpenDotaError(
      502,
      "opendota_response_too_large",
      "اطلاعات دریافتی این مچ بیش از حد مجاز است",
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > config.maxResponseBytes) {
    throw new OpenDotaError(
      502,
      "opendota_response_too_large",
      "اطلاعات دریافتی این مچ معتبر نیست",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new OpenDotaError(
      502,
      "invalid_opendota_json",
      "اطلاعات دریافتی مچ معتبر نیست",
    );
  }

  return raw;
}

export async function fetchOpenDotaMatch(dotaMatchId: number) {
  const raw = await fetchOpenDotaJson(`matches/${dotaMatchId}`, {
    code: "opendota_match_not_found",
    message: "این Match ID پیدا نشد",
  });
  return parseOpenDotaMatch(raw, dotaMatchId);
}

export async function fetchOpenDotaRecentMatches(steamAccountId: number) {
  const raw = await fetchOpenDotaJson(
    `players/${steamAccountId}/recentMatches`,
    {
      code: "opendota_player_not_found",
      message: "مچ‌های این بازیکن پیدا نشد",
    },
  );
  return parseOpenDotaRecentMatches(raw);
}

export async function fetchOpenDotaPlayerMatchesSince(
  steamAccountId: number,
  since: Date,
) {
  const ageMs = Math.max(0, Date.now() - since.getTime());
  const days = Math.max(1, Math.ceil(ageMs / 86_400_000) + 1);
  const params = new URLSearchParams({ date: String(days) });
  const raw = await fetchOpenDotaJson(
    `players/${steamAccountId}/matches?${params.toString()}`,
    {
      code: "opendota_player_not_found",
      message: "مچ‌های این بازیکن پیدا نشد",
    },
  );
  return parseOpenDotaRecentMatches(raw);
}
