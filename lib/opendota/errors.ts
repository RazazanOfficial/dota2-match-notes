import { ZodError } from "zod";

export class OpenDotaError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "OpenDotaError";
  }
}

export function openDotaErrorResponse(error: unknown) {
  if (error instanceof OpenDotaError) {
    const headers = error.retryAfterSeconds
      ? { "Retry-After": String(error.retryAfterSeconds) }
      : undefined;
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.retryAfterSeconds
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
      },
      { status: error.status, headers },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "invalid_payload",
          message: error.issues[0]?.message || "اطلاعات همگام‌سازی نامعتبر است",
        },
      },
      { status: 422 },
    );
  }

  console.error("OpenDota sync failed", error);
  return Response.json(
    {
      ok: false,
      error: {
        code: "opendota_sync_failed",
        message: "همگام‌سازی اطلاعات مچ انجام نشد",
      },
    },
    { status: 500 },
  );
}
