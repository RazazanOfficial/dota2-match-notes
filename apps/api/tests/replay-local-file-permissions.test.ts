import { describe, expect, it } from "vitest";
import { hasPrivateReplayPermissions } from "../src/lib/replay/local-file-permissions";

describe("replay checkpoint permissions on each host OS", () => {
  it("accepts private Linux directories and files owned by the API user", () => {
    expect(hasPrivateReplayPermissions({ mode: 0o40700, uid: 1001 }, "linux", 1001)).toBe(true);
    expect(hasPrivateReplayPermissions({ mode: 0o100600, uid: 1001 }, "linux", 1001)).toBe(true);
  });
  it("rejects Linux group/other access even for the correct owner", () => {
    for (const mode of [0o40750, 0o40777, 0o100640, 0o100666]) {
      expect(hasPrivateReplayPermissions({ mode, uid: 1001 }, "linux", 1001)).toBe(false);
    }
  });
  it("rejects a private Linux checkpoint owned by another user", () => {
    expect(hasPrivateReplayPermissions({ mode: 0o100600, uid: 1002 }, "linux", 1001)).toBe(false);
  });
  it("does not interpret Windows synthesized stat modes as Unix permissions", () => {
    expect(hasPrivateReplayPermissions({ mode: 0o40777, uid: 0 }, "win32", undefined)).toBe(true);
    expect(hasPrivateReplayPermissions({ mode: 0o100666, uid: 0 }, "win32", undefined)).toBe(true);
  });
});
