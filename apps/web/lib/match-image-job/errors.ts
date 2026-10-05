import { SyncWorkerError } from "../sync/errors";

export function matchImageJobErrorResponse(error: unknown) {
  if (error instanceof SyncWorkerError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error("Match image worker failed", error);
  return Response.json(
    {
      ok: false,
      error: {
        code: "match_image_worker_failed",
        message: "اجرای Worker تصاویر مچ انجام نشد",
      },
    },
    { status: 500 },
  );
}
