import { describe, expect, it } from "vitest";
import { banWritePolicy } from "../lib/journal/ban-policy";

describe("manual bans", () => {
  it("persists an explicitly empty override so incomplete automatic bans stay hidden", () => {
    expect(banWritePolicy(true, false)).toEqual({ override: true, preserveRows: false });
  });

  it("permits resetting to current OpenDota bans", () => {
    expect(banWritePolicy(false, true)).toEqual({ override: false, preserveRows: false });
  });

  it("does not erase earlier manual edits when an old client saves without the new flag", () => {
    expect(banWritePolicy(undefined, true)).toEqual({ override: true, preserveRows: true });
  });
});
