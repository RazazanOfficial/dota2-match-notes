import { describe, expect, it } from "vitest";
import type { HttpRequest } from "../src/http/protocol";
import { clientAddress } from "../src/lib/auth/client-address";

describe("password login client address", () => {
  it("uses the proxy's real address even if the caller supplied a forwarded chain", () => {
    const request = {
      headers: new Headers({
        "x-real-ip": "203.0.113.8",
        "x-forwarded-for": "192.0.2.14, 203.0.113.8",
      }),
    } as HttpRequest;
    expect(clientAddress(request)).toBe("203.0.113.8");
  });

  it("shares a fallback bucket when the trusted proxy header is absent", () => {
    const request = { headers: new Headers({ "x-forwarded-for": "192.0.2.14" }) } as HttpRequest;
    expect(clientAddress(request)).toBe("unknown");
  });
});
