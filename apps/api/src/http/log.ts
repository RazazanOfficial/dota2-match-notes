/** Never log database query parameters, passwords, tokens or provider URLs. */
export function logFailure(message: string, context?: unknown) {
  const record: Record<string, string | number> = {};
  const object = context && typeof context === "object" ? context as Record<string, unknown> : undefined;
  const error = context instanceof Error ? context : object?.error;
  if (error instanceof Error) record.name = error.constructor.name.slice(0, 80);
  const status = object?.status;
  if (typeof status === "number" && Number.isInteger(status)) record.status = status;
  for (const key of ["matchId", "dotaMatchId"]) {
    const value = object?.[key];
    if (typeof value === "number" && Number.isSafeInteger(value)) record[key] = value;
  }
  console.error(message, record);
}
