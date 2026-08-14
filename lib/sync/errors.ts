export class SyncWorkerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SyncWorkerError";
  }
}

export function syncWorkerErrorResponse(error: unknown) {
  if (error instanceof SyncWorkerError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error("Scheduled sync worker failed", error);
  return Response.json(
    {
      ok: false,
      error: {
        code: "sync_worker_failed",
        message: "اجرای Worker همگام‌سازی انجام نشد",
      },
    },
    { status: 500 },
  );
}
