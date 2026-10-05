import { describe, expect, it } from "vitest";
import {
  normalizePasswordSteamIdentifier,
  passwordChangeSchema,
} from "../lib/auth/password-validation";

describe("password authentication input", () => {
  it("accepts both Steam64 and Account ID forms", () => {
    expect(normalizePasswordSteamIdentifier("988195076")).toBe("76561198948460804");
    expect(normalizePasswordSteamIdentifier("76561198948460804")).toBe("76561198948460804");
  });

  it("requires matching passwords", () => {
    expect(() =>
      passwordChangeSchema.parse({
        password: "a-secure-password",
        confirmPassword: "another-password",
      }),
    ).toThrow("تکرار رمز عبور یکسان نیست");
  });
});
