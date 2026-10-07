/** Never log database query parameters, passwords, tokens or provider URLs. */
export function logFailure(message: string, context?: unknown) {
  const record: Record<string, string | number> = {};
  const object = context && typeof context === "object" ? context as Record<string, unknown> : undefined;
  const error = context instanceof Error ? context : object?.error;
  if (error instanceof Error) {
    record.name = error.name.slice(0, 80);
    const cause = error.cause;
    const code = "code" in error ? error.code : cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) record.causeCode = code;
  }
  const status = object?.status;
  if (typeof status === "number" && Number.isInteger(status)) record.status = status;
  const elapsedMs = object?.elapsedMs;
  if (typeof elapsedMs === "number" && Number.isSafeInteger(elapsedMs) && elapsedMs >= 0) record.elapsedMs = elapsedMs;
  for (const key of ["matchId", "dotaMatchId"]) {
    const value = object?.[key];
    if (typeof value === "number" && Number.isSafeInteger(value)) record[key] = value;
  }
  console.error(message, record);
}
