import { ZodError } from "zod";
import { PasswordAuthError } from "./password";

export function passwordAuthErrorResponse(error: unknown) {
  if (error instanceof PasswordAuthError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
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
      {
        ok: false,
        error: {
          code: "invalid_password_request",
          message: error.issues[0]?.message || "اطلاعات ورود معتبر نیست",
        },
      },
      { status: 400 },
    );
  }
  console.error("Password authentication failed", error);
  return Response.json(
    {
      ok: false,
      error: { code: "password_auth_failed", message: "ورود انجام نشد" },
    },
    { status: 500 },
  );
}
