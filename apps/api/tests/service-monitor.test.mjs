import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { redact, parseProperties, UNITS, APP_UNITS, COMPUTE_UNITS, durationSeconds, timerTimestamp, monotonicTimestamp } from "../scripts/service-monitor/collect.mjs";
import { parseMonitorSnapshot, getServiceMonitor, monitorUnits } from "../src/lib/admin/service-monitor";
import { readFile, stat } from "node:fs/promises";
import { getTopology } from "../src/runtime/topology";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), stat: vi.fn() }));
vi.mock("../src/lib/db", () => ({ getDb: () => ({ execute: async () => ({ rows: [] }) }) }));
vi.mock("../src/runtime/topology", async importOriginal => ({ ...await importOriginal(), getTopology: vi.fn() }));

describe("service monitor collector boundaries", () => {
  it("accepts the complete allowlist and rejects duplicate or arbitrary units", () => {
    const capturedAt = "2026-10-10T12:00:00Z";
    const units = UNITS.map(id => ({ id, properties: { ActiveState: "active" }, logs: [], error: null }));
    expect(parseMonitorSnapshot(JSON.stringify({ version: 1, capturedAt, units })).units.map(unit => unit.id)).toEqual(UNITS);
    expect(() => parseMonitorSnapshot(JSON.stringify({ version: 1, capturedAt, units: [...units, units[0]] }))).toThrow();
    expect(() => parseMonitorSnapshot(JSON.stringify({ version: 1, capturedAt, units: [{...units[0],id:"ssh.service"}] }))).toThrow();
  });
  it("limits systemd units to a fixed allowlist", () => {
    expect(UNITS).toContain("dota2notes-performance-reference.timer");
    expect(UNITS).toContain("nginx.service");
    expect(UNITS).not.toContain("dota2notes-sync-manual.timer");
    expect(UNITS).toContain("dota2notes-monitor.timer");
    expect(UNITS).toContain("dota2notes-monitor.service");
    expect(UNITS).not.toContain("ssh.service");
    expect(new Set(UNITS).size).toBe(UNITS.length);
    expect(APP_UNITS).toEqual(monitorUnits.app);
    expect(COMPUTE_UNITS).toEqual(monitorUnits.compute);
    expect(COMPUTE_UNITS).not.toContain("dota2notes.service");
    expect(COMPUTE_UNITS).not.toContain("postgresql.service");
  });
  it("rejects host confusion and derives timings without invented deadlines", () => {
    const snapshot = { version: 2, role: "compute", capturedAt: new Date().toISOString(), units: [{ id: "dota2notes.service", properties: {}, logs: [], error: null }] };
    expect(() => parseMonitorSnapshot(JSON.stringify(snapshot))).toThrow("invalid_monitor_host");
    expect(durationSeconds("1min 10s")).toBe(70);
    expect(durationSeconds("500ms")).toBe(.5);
    expect(durationSeconds("0")).toBe(0);
    expect(durationSeconds("unknown")).toBeNull();
    expect(timerTimestamp(1794650400000000)).toBe(new Date(1794650400000).toISOString());
    expect(timerTimestamp("18446744073709551615")).toBeNull();
    expect(timerTimestamp(null)).toBeNull();
    expect(monotonicTimestamp("2min", 1000000, 100)).toBe(new Date(1020000).toISOString());
    expect(monotonicTimestamp("0", 1000000, 100)).toBeNull();
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

describe("two-host service report", () => {
  const capturedAt = () => new Date().toISOString();
  const units = role => monitorUnits[role].map(id => ({ id, properties: { ActiveState: "active" }, logs: [], error: null }));
  beforeEach(() => {
    getTopology.mockReturnValue({ role: "app", computeOrigin: "http://127.0.0.1:14100", computeToken: "test-private-bridge", timeoutMs: 10000 });
    stat.mockResolvedValue({ size: 1000 });
    readFile.mockImplementation(async () => JSON.stringify({ version: 2, role: "app", capturedAt: capturedAt(), units: units("app") }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("keeps the Iran report on a private-link failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const result = await getServiceMonitor(new Headers({ authorization: "Bearer user-session" }));
    expect(result.hosts[0].id).toBe("iran");
    expect(result.hosts[0].units.map(unit => unit.id)).toContain("dota2notes.service");
    expect(result.hosts[0].snapshotError).toBeNull();
    expect(result.hosts[1].id).toBe("germany");
    expect(result.hosts[1].units).toEqual([]);
    expect(result.hosts[1].snapshotError).toBeTruthy();
  });
  it("uses the fixed private path and both authentication layers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ monitor: { hosts: [{ id: "germany", capturedAt: capturedAt(), units: units("compute") }] } })));
    vi.stubGlobal("fetch", fetcher);
    const result = await getServiceMonitor(new Headers({ authorization: "Bearer user-session", cookie: "session=example" }));
    expect(result.hosts[1].snapshotError).toBeNull();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:14100/api/admin/service-monitor");
    expect(options.headers.get("x-dota-compute-token")).toBe("test-private-bridge");
    expect(options.headers.get("authorization")).toBe("Bearer user-session");
    expect(options.redirect).toBe("error");
  });
  it("does not relabel an old snapshot as a valid Iran report", async () => {
    readFile.mockResolvedValue(JSON.stringify({ version: 1, capturedAt: capturedAt(), units: units("compute") }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await getServiceMonitor()).hosts[0].units).toEqual([]);
  });
  it("returns a bounded private snapshot once and omits shared queue queries", async () => {
    getTopology.mockReturnValue({ role: "compute" });
    const largeUnits = units("compute").map(unit => ({ ...unit, logs: Array.from({ length: 35 }, () => ({ at: capturedAt(), priority: 6, message: "x".repeat(800) })) }));
    readFile.mockResolvedValue(JSON.stringify({ version: 2, role: "compute", capturedAt: capturedAt(), units: largeUnits }));
    const result = await getServiceMonitor();
    expect(result.units).toEqual([]);
    expect(result.hosts[0].units).toHaveLength(COMPUTE_UNITS.length);
    expect(Buffer.byteLength(JSON.stringify({ ok: true, monitor: result }))).toBeLessThan(512 * 1024);
    expect(result.queues).toEqual([]);
  });
});
