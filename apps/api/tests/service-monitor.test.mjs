import { describe, it, expect } from "vitest";
import { redact, parseProperties, UNITS } from "../scripts/service-monitor/collect.mjs";

describe("service monitor collector boundaries", () => {
  it("limits systemd units to a fixed allowlist", () => {
    expect(UNITS).toContain("dota2notes-performance-reference.timer");
    expect(UNITS).toContain("nginx.service");
    expect(UNITS).not.toContain("ssh.service");
    expect(new Set(UNITS).size).toBe(UNITS.length);
  });
  it("omits lines likely to contain secrets while keeping ordinary worker output", () => {
    expect(redact('POST Authorization: Bearer abc')).toBe("[sensitive log omitted]");
    expect(redact('{"api_token":"hidden"}')).toBe("[sensitive log omitted]");
    expect(redact('https://host/?Signature=hidden')).toBe("[sensitive log omitted]");
    expect(redact('{"processed":1,"cursor":93}')).toContain('"cursor":93');
    expect(redact("x".repeat(900))).toHaveLength(800);
  });
  it("parses only known systemd fields", () => {
    expect(parseProperties("ActiveState=active\nSubState=running\nUnknown=secret\nResult=success\n"))
      .toEqual({ ActiveState: "active", SubState: "running", Result: "success" });
  });
});
