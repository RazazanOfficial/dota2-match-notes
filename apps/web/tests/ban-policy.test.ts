import { describe, expect, it } from "vitest";
import { selectVisibleBans } from "../lib/journal/ban-policy";

describe("read-only match bans", () => {
  const automatic = [{ id: 2, source: "opendota" }];
  const historic = [{ id: 3, source: "manual" }];

  it("prefers the OpenDota draft for an imported match, even with older manual edits", () => {
    expect(selectVisibleBans({ match_id: 123 }, automatic, historic)).toEqual(automatic);
  });

  it("does not invent bans when the provider draft is missing", () => {
    expect(selectVisibleBans({ match_id: 123 }, [], historic)).toEqual([]);
  });

  it("keeps historic bans visible for a journal entry without an imported match", () => {
    expect(selectVisibleBans(null, automatic, historic)).toEqual(historic);
  });
});
