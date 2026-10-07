import { HealthSchema, type HealthResponse } from "@dota-notes/contracts";
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "ApiError"; }
}
export function createApiClient(baseUrl: string, fetcher: typeof fetch = fetch) {
  const base = new URL(baseUrl);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("API base URL must be an HTTP(S) URL without credentials, query or fragment");
  }
  base.pathname = `${base.pathname.replace(/\/$/, "")}/`;
  return {
    async health(signal?: AbortSignal): Promise<HealthResponse> {
      const response = await fetcher(new URL("api/v1/health", base), { signal, credentials: "omit", headers: { Accept: "application/json" } });
      if (!response.ok) throw new ApiError("API request failed", response.status);
      const parsed = HealthSchema.safeParse(await response.json());
      if (!parsed.success) throw new ApiError("Unexpected API response", response.status);
      return parsed.data;
    },
  };
}
