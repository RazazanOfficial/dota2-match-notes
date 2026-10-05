import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src";

const health = { ok: true, service: "dota-notes-api", apiVersion: "v1", status: "foundation" };
describe("versioned API client", () => {
  it("validates responses and propagates cancellation without browser cookies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(health)));
    const controller = new AbortController();
    expect(await createApiClient("https://example.org/", fetcher).health(controller.signal)).toEqual(health);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://example.org/api/v1/health");
    expect(options?.credentials).toBe("omit");
    expect(options?.signal).toBe(controller.signal);
  });
  it("rejects an HTTP error and incompatible contracts instead of reporting success", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(new Response('{"ok":true}'));
    const client = createApiClient("https://example.org", fetcher);
    await expect(client.health()).rejects.toMatchObject({ status: 503 });
    await expect(client.health()).rejects.toThrow("Unexpected API response");
  });
  it("rejects credentials and non-HTTP schemes in client configuration", () => {
    for (const url of ["file:///tmp", "https://secret@example.org", "https://example.org/?token=secret"]) expect(() => createApiClient(url)).toThrow();
  });
});
