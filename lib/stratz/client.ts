import { getStratzConfig } from "./config";
import { StratzError } from "./errors";
import { parseStratzResponse } from "./validation";

function matchSelection(matchId: number, index: number) {
  return `
    match${index}: match(id: ${matchId}) {
      id
      parsedDateTime
      statsDateTime
      players {
        steamAccountId
        playerSlot
        heroId
        position
        role
        roleBasic
      }
      pickBans {
        isPick
        heroId
        order
        bannedHeroId
        isRadiant
        playerIndex
        wasBannedSuccessfully
        isCaptain
      }
    }`;
}

function retryAfter(value: string | null) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

export async function fetchStratzDiagnostics(matchIds: number[]) {
  const config = getStratzConfig();
  const query = `query MatchDiagnostics {${matchIds.map(matchSelection).join("")}\n}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "User-Agent": "STRATZ_API",
      },
      body: JSON.stringify({ operationName: "MatchDiagnostics", query }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new StratzError(504, "stratz_timeout", "زمان پاسخ‌گویی STRATZ بیش از حد طول کشید");
    }
    throw new StratzError(502, "stratz_unavailable", "ارتباط با STRATZ برقرار نشد");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw new StratzError(502, "stratz_auth_failed", "توکن STRATZ پذیرفته نشد");
  }
  if (response.status === 429) {
    throw new StratzError(
      429,
      "stratz_rate_limited",
      "محدودیت درخواست STRATZ فعال شده است",
      retryAfter(response.headers.get("retry-after")),
    );
  }
  if (!response.ok) {
    throw new StratzError(502, "stratz_bad_status", "STRATZ پاسخ قابل استفاده‌ای نداد");
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > config.maxResponseBytes) {
    throw new StratzError(502, "stratz_response_too_large", "حجم پاسخ STRATZ بیش از حد مجاز است");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > config.maxResponseBytes) {
    throw new StratzError(502, "stratz_response_too_large", "حجم پاسخ STRATZ نامعتبر است");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new StratzError(502, "invalid_stratz_json", "STRATZ پاسخ JSON معتبر نداد");
  }
  return parseStratzResponse(raw, matchIds);
}
