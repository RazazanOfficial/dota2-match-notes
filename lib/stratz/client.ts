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

function errorDetails(response: Response) {
  const cfRay = response.headers.get("cf-ray")?.trim();
  return {
    upstreamStatus: response.status,
    ...(cfRay ? { cfRay } : {}),
  };
}

function upstreamMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.message === "string") return record.message;
      if (typeof record.error === "string") return record.error;
      if (Array.isArray(record.errors)) {
        return record.errors
          .map((entry) => {
            if (!entry || typeof entry !== "object") return "";
            const message = (entry as Record<string, unknown>).message;
            return typeof message === "string" ? message : "";
          })
          .filter(Boolean)
          .join(" ");
      }
    }
  } catch {
    // Plain-text and HTML upstream errors are handled below.
  }
  return trimmed;
}

function throwForUpstreamError(response: Response, text: string): never {
  const message = upstreamMessage(text);
  const details = errorDetails(response);
  if (/cannot use different ip addresses/i.test(message)) {
    throw new StratzError(
      502,
      "stratz_ip_conflict",
      "توکن STRATZ از بیش از یک IP استفاده شده است؛ اتصال باید فقط از IP ثابت سرور انجام شود",
      undefined,
      details,
    );
  }
  if (response.status === 429) {
    throw new StratzError(
      429,
      "stratz_rate_limited",
      "محدودیت درخواست STRATZ فعال شده است",
      retryAfter(response.headers.get("retry-after")),
      details,
    );
  }
  if (
    response.status === 401
    || /(?:invalid|expired|missing).{0,20}(?:token|jwt)|unauthori[sz]ed/i.test(message)
  ) {
    throw new StratzError(
      502,
      "stratz_auth_failed",
      "توکن STRATZ پذیرفته نشد",
      undefined,
      details,
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (
    contentType.includes("text/html")
    || /just a moment|attention required|cloudflare challenge/i.test(message)
  ) {
    throw new StratzError(
      502,
      "stratz_edge_blocked",
      "لایه امنیتی STRATZ درخواست سرور را مسدود کرد",
      undefined,
      details,
    );
  }
  if (response.status === 403) {
    throw new StratzError(
      502,
      "stratz_forbidden",
      "STRATZ درخواست سرور را رد کرد",
      undefined,
      details,
    );
  }
  if (response.status >= 500) {
    throw new StratzError(
      502,
      "stratz_upstream_error",
      "سرویس STRATZ موقتاً خطای داخلی برگرداند",
      undefined,
      details,
    );
  }
  throw new StratzError(
    502,
    "stratz_bad_status",
    "STRATZ پاسخ قابل استفاده‌ای نداد",
    undefined,
    details,
  );
}

export async function fetchStratzDiagnostics(matchIds: number[]) {
  const config = getStratzConfig();
  const query = `query MatchDiagnostics {${matchIds.map(matchSelection).join("")}\n}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
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
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > config.maxResponseBytes) {
      throw new StratzError(502, "stratz_response_too_large", "حجم پاسخ STRATZ بیش از حد مجاز است");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > config.maxResponseBytes) {
      throw new StratzError(502, "stratz_response_too_large", "حجم پاسخ STRATZ بیش از حد مجاز است");
    }
    const text = new TextDecoder().decode(bytes);
    if (!response.ok) throwForUpstreamError(response, text);
    if (!bytes.byteLength) {
      throw new StratzError(502, "invalid_stratz_json", "STRATZ پاسخ JSON معتبر نداد");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new StratzError(502, "invalid_stratz_json", "STRATZ پاسخ JSON معتبر نداد");
    }
    return parseStratzResponse(raw, matchIds);
  } catch (error) {
    if (error instanceof StratzError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new StratzError(504, "stratz_timeout", "زمان پاسخ‌گویی STRATZ بیش از حد طول کشید");
    }
    throw new StratzError(502, "stratz_unavailable", "ارتباط با STRATZ برقرار نشد");
  } finally {
    clearTimeout(timeout);
  }
}
