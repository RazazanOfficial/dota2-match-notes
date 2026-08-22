import { ZodError } from "zod";

export interface StratzErrorDetails {
  upstreamStatus?: number;
  cfRay?: string;
}

export class StratzError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
    readonly details?: StratzErrorDetails,
  ) {
    super(message);
    this.name = "StratzError";
  }
}

export function stratzErrorResponse(error: unknown) {
  if (error instanceof StratzError) {
    console.warn("STRATZ request failed", {
      code: error.code,
      status: error.status,
      ...error.details,
    });
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      {
        status: error.status,
        headers: error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : undefined,
      },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      { ok: false, error: { code: "invalid_request", message: "Match IDها معتبر نیستند" } },
      { status: 400 },
    );
  }
  if (error instanceof Error && /^(Missing|Invalid) env: STRATZ_/.test(error.message)) {
    return Response.json(
      { ok: false, error: { code: "stratz_not_configured", message: "تنظیمات STRATZ روی سرور کامل نیست" } },
      { status: 503 },
    );
  }
  console.error("STRATZ diagnostics failed", error);
  return Response.json(
    { ok: false, error: { code: "internal_error", message: "خطای داخلی سرور رخ داد" } },
    { status: 500 },
  );
}
