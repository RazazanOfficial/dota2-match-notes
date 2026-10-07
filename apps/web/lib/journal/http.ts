import { ZodError } from "zod";

export function jsonError(status: number, code: string, message: string) {
  return Response.json(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}

export function journalErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError(422, "invalid_payload", error.issues[0]?.message || "داده نامعتبر است");
  }

  console.error("Journal API failed", error);
  return jsonError(500, "internal_error", "عملیات دفتر مچ انجام نشد");
}
