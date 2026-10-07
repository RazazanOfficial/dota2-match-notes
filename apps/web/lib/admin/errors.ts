import { ZodError } from "zod";

export class AdminError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: { code: "invalid_request", message: "اطلاعات درخواست معتبر نیست" },
      },
      { status: 400 },
    );
  }

  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError?.code === "23505") {
    if (databaseError.constraint === "release_notes_version_uidx") {
      return Response.json(
        { ok: false, error: { code: "release_version_conflict", message: "این شماره نسخه قبلاً ثبت شده است" } },
        { status: 409 },
      );
    }
    return Response.json(
      {
        ok: false,
        error: {
          code: "steam_user_conflict",
          message: "این حساب Steam قبلاً با اطلاعات دیگری ثبت شده است",
        },
      },
      { status: 409 },
    );
  }

  console.error("Admin API failed", error);
  return Response.json(
    {
      ok: false,
      error: { code: "internal_error", message: "خطای داخلی سرور رخ داد" },
    },
    { status: 500 },
  );
}
