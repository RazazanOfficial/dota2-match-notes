import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { HttpRequest } from "../src/http/protocol";
import { GET as start } from "../src/routes/auth/desktop/start/route";
import { parseDesktopState } from "../src/lib/auth/desktop";

afterEach(() => vi.unstubAllEnvs());

describe("desktop Steam sign-in initiation", () => {
  it("binds a Steam state cookie to the PKCE challenge and app nonce", async () => {
    vi.stubEnv("APP_URL", "https://dota.example");
    vi.stubEnv("API_PUBLIC_ORIGIN", "https://api.dota.example");
    const challenge = createHash("sha256").update("v".repeat(43)).digest("base64url");
    const nonce = "n".repeat(43);
    const response = await start(new HttpRequest(`https://api.dota.example/api/auth/desktop/start?challenge=${challenge}&nonce=${nonce}`));
    expect(response.status).toBe(307);
    const state = parseDesktopState(decodeURIComponent(response.headers.get("set-cookie")!.split(";")[0].split("=")[1]));
    expect(state).toMatchObject({ challenge, nonce });
    const steam = new URL(response.headers.get("location")!);
    expect(steam.searchParams.get("openid.realm")).toBe("https://api.dota.example");
    expect(steam.searchParams.get("openid.return_to")).toBe(`https://api.dota.example/api/auth/steam/callback?state=${state?.state}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect((await start(new HttpRequest("https://api.dota.example/api/auth/desktop/start?challenge=bad&nonce=bad"))).status).toBe(400);
  });

  it("rejects malformed desktop state instead of treating it as native login", () => {
    expect(parseDesktopState("x.y.z")).toBeNull();
    expect(parseDesktopState("z".repeat(43))).toBeNull();
  });
});
