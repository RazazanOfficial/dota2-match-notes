import { describe, it, expect } from "vitest";
import { redact, parseProperties, UNITS } from "../scripts/service-monitor/collect.mjs";
import { parseMonitorSnapshot } from "../src/lib/admin/service-monitor";

describe("service monitor collector boundaries", () => {
  it("accepts the complete collector snapshot, including the actual manual-sync and monitor units", () => {
    const capturedAt = "2026-10-10T12:00:00Z";
    const units = UNITS.map(id => ({ id, properties: { ActiveState: "active" }, logs: [], error: null }));
    expect(parseMonitorSnapshot(JSON.stringify({ version: 1, capturedAt, units })).units.map(unit => unit.id)).toEqual(UNITS);
    expect(() => parseMonitorSnapshot(JSON.stringify({ version: 1, capturedAt, units: [...units, units[0]] }))).toThrow();
    expect(() => parseMonitorSnapshot(JSON.stringify({ version: 1, capturedAt, units: [{...units[0],id:"ssh.service"}] }))).toThrow();
  });
  it("limits systemd units to a fixed allowlist", () => {
    expect(UNITS).toContain("dota2notes-performance-reference.timer");
    expect(UNITS).toContain("nginx.service");
    expect(UNITS).toContain("dota2notes-sync-manual.timer");
    expect(UNITS).toContain("dota2notes-monitor.timer");
    expect(UNITS).toContain("dota2notes-monitor.service");
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
