import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { clientAddress } from "../lib/auth/client-address";

describe("password login client address", () => {
  it("uses the proxy's real address even if the caller supplied a forwarded chain", () => {
    const request = {
      headers: new Headers({
        "x-real-ip": "203.0.113.8",
        "x-forwarded-for": "192.0.2.14, 203.0.113.8",
      }),
    } as NextRequest;
    expect(clientAddress(request)).toBe("203.0.113.8");
  });

  it("shares a fallback bucket when the trusted proxy header is absent", () => {
    const request = { headers: new Headers({ "x-forwarded-for": "192.0.2.14" }) } as NextRequest;
    expect(clientAddress(request)).toBe("unknown");
  });
});
