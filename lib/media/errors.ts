import { ZodError } from "zod";

export class MediaError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "MediaError";
  }
}

export function mediaErrorResponse(error: unknown) {
  if (error instanceof MediaError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "invalid_payload",
          message: error.issues[0]?.message || "اطلاعات تصویر نامعتبر است",
        },
      },
      { status: 422 },
    );
  }

  console.error("Match image API failed", error);
  return Response.json(
    {
      ok: false,
      error: { code: "image_operation_failed", message: "عملیات تصویر انجام نشد" },
    },
    { status: 500 },
  );
}
