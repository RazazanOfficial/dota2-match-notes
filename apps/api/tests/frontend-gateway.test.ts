import { afterEach, describe, expect, it, vi } from "vitest";
import { backendOrigin, forwardApiRequest } from "../../web/lib/backend/proxy";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("frontend gateway to Express", () => {
  it("forwards cookies and redirects without following the Steam redirect", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://127.0.0.1:4100");
    const headers = new Headers({ location: "https://steamcommunity.com/openid/login" });
    headers.append("set-cookie", "state=one; HttpOnly; Secure; SameSite=Lax");
    headers.append("set-cookie", "other=two; HttpOnly");
    const fetcher = vi.fn(async () => new Response(null, { status: 307, headers }));vi.stubGlobal("fetch", fetcher);
    const result=await forwardApiRequest(new Request("https://dota.example/api/auth/steam", { headers:{cookie:"existing=abc",host:"hostile.example","x-real-ip":"spoofed"} }));
    expect(result.status).toBe(307);expect(result.headers.getSetCookie()).toHaveLength(2);
    const [url,options]=fetcher.mock.calls[0] as unknown as [URL,RequestInit];
    expect(url.origin).toBe("http://127.0.0.1:4100");expect(options.redirect).toBe("manual");
    expect(new Headers(options.headers).get("cookie")).toBe("existing=abc");
    expect(new Headers(options.headers).get("x-real-ip")).toBeNull();
  });
  it("never exposes private workers through legacy, versioned, encoded or case variants", async () => {
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    for(const path of ["/api/internal/sync/tick","/api/v1/internal/images/tick","/api/v1/INTERNAL/stratz/tick","/api/v1/%69nternal/sync/tick"]){
      expect((await forwardApiRequest(new Request("https://dota.example"+path,{method:"POST"}))).status).toBe(404);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects oversized streaming bodies without trusting content-length", async () => {
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(512001));controller.close();}});
    const incoming=new Request("https://dota.example/api/journal/days/2026-10-03",{method:"PUT",body:stream,duplex:"half"} as RequestInit);
    expect((await forwardApiRequest(incoming)).status).toBe(413);expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns unavailable instead of a fake success when Express is down", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>{throw new Error("private connection details");}));
    const result=await forwardApiRequest(new Request("https://dota.example/api/auth/session"));
    expect(result.status).toBe(503);expect(JSON.stringify(await result.json())).not.toContain("private connection details");
  });
  it("does not accept user-controlled origins or configuration containing credentials", () => {
    vi.stubEnv("API_INTERNAL_ORIGIN","http://user:secret@example.com");expect(()=>backendOrigin()).toThrow();
  });
});
