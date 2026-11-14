import { requireComputeNode } from "../../runtime/topology";
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
  requireComputeNode();
  const config = getOpenDotaConfig();
  const url = new URL(`${config.baseUrl}/${path.replace(/^\/+/, "")}`);
  if (config.apiKey) url.searchParams.set("api_key", config.apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response | undefined;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
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

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > config.maxResponseBytes) {
            void reader.cancel().catch(() => {});
            throw new OpenDotaError(502, "opendota_response_too_large", "اطلاعات دریافتی این مچ بیش از حد مجاز است");
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    if (size <= 0) {
      throw new OpenDotaError(
        502,
        "opendota_response_too_large",
        "اطلاعات دریافتی این مچ معتبر نیست",
      );
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }

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
  } catch (error) {
    if (error instanceof OpenDotaError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new OpenDotaError(504, "opendota_timeout", "دریافت اطلاعات مچ‌ها بیش از حد طول کشید؛ دوباره تلاش کنید");
    }
    throw new OpenDotaError(502, "opendota_unavailable", "اطلاعات مچ‌ها دریافت نشد؛ دوباره تلاش کنید");
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (response?.body && !response.body.locked && !response.bodyUsed) void response.body.cancel().catch(() => {});
  }
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
  offset = 0,
  limit = 100,
) {
  const ageMs = Math.max(0, Date.now() - since.getTime());
  const days = Math.max(1, Math.ceil(ageMs / 86_400_000) + 1);
  // OpenDota defaults significant to 1, which removes Turbo and other
  // non-standard modes before our requested game-mode filter sees them.
  const params = new URLSearchParams({ date: String(days), limit: String(limit), offset: String(offset), significant: "0" });
  const raw = await fetchOpenDotaJson(
    `players/${steamAccountId}/matches?${params.toString()}`,
    {
      code: "opendota_player_not_found",
      message: "مچ‌های این بازیکن پیدا نشد",
    },
  );
  return parseOpenDotaRecentMatches(raw);
}
