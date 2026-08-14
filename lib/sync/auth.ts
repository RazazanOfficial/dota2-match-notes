import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSyncWorkerConfig } from "./config";
import { SyncWorkerError } from "./errors";

export function requireSyncWorkerSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${getSyncWorkerConfig().secret}`;
  const receivedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  const valid =
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer);

  if (!valid) {
    throw new SyncWorkerError(
      401,
      "invalid_worker_secret",
      "اعتبار Worker معتبر نیست",
    );
  }
}
