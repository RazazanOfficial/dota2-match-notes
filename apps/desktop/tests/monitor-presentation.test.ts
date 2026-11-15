import { describe, expect, it } from "vitest";
import { latestMonitorErrors, logLevel, monitorDate, structuredValue } from "../src/monitorPresentation";
import { messages } from "../src/i18n";
import type { MonitorHost } from "../src/admin";

const level = (message: string, priority = 6) => logLevel({ message, priority, at: null });
describe("monitor log interpretation", () => {
  it("uses application failures from stdout without treating empty error fields as failures", () => {
    expect(level('Error: Server Reference ID did not match')).toBe("error");
    expect(level('dota2notes.service: Failed with result exit-code')).toBe("error");
    expect(level(JSON.stringify({ ok: true, jobs: [{ error: { name: "TimeoutError" } }] }))).toBe("error");
    expect(level(JSON.stringify({ error: null, errors: [], failed: 0, ok: true }))).toBe("info");
    expect(level(JSON.stringify({ error: false, errors: {}, failed: "0" }))).toBe("info");
  });
  it("does not turn successful HTTP handling into successful jobs", () => {
    expect(level("HTTP 200")).toBe("info");
    expect(level('{"ok":true}')).toBe("info");
    expect(level('{"status":"success","results":[{"status":"failed"}]}')).toBe("error");
    expect(level('{"level":"success"}')).toBe("success");
    expect(level("Completed successfully")).toBe("success");
    expect(level('{"level":"success"}', 3)).toBe("error");
    expect(level('{"status":"success"}', 4)).toBe("warning");
  });
  it("keeps malformed JSON and systemd schedule syntax intact", () => {
    expect(structuredValue('{"error":')).toEqual({ text: '{"error":', json: false });
    expect(structuredValue('{ OnBootUSec=1min ; next_elapse=1min }').json).toBe(false);
    expect(structuredValue('{"OnBootSec":"1min"}')).toEqual({text:'{\n  "OnBootSec": "1min"\n}',json:true});
  });
  it("classifies the actual replay worker's structured event codes", () => {
    expect(level('{"code":"archive_stopped","transportCode":"storage_unauthorized","stage":"upload"}')).toBe("error");
    expect(level('{"code":"replay_pipeline_failed","name":"AbortError"}')).toBe("error");
    expect(level('{"code":"archive_retry_scheduled","retrySeconds":600}')).toBe("warning");
    expect(level('{"code":"archive_complete","matchId":9036364671}')).toBe("success");
    expect(level('{"phase":"completed","code":"job_complete"}')).toBe("success");
    expect(level('{"phase":"parsing","code":"parse_complete"}')).toBe("success");
    expect(level('{"code":"unrecognized_event"}')).toBe("info");
  });
  it("uses Latin digits with the Persian calendar and preserves unknown timestamps", () => {
    const date = monitorDate("2026-11-15T08:00:00Z", messages.fa);
    expect(date).not.toMatch(/[۰-۹٠-٩]/);
    expect(date).toContain("1405");
    expect(monitorDate("invalid", messages.fa)).toBe("—");
  });
});
describe("latest monitoring errors", () => {
  it("keeps host/unit attribution, timer errors and unknown occurrence times", () => {
    const at = "2026-11-15T08:00:00Z";
    const hosts: MonitorHost[] = [{ id:"iran",label:"Iran VPS",capturedAt:at,stale:false,snapshotError:null,units:[
      {id:"dota2notes-api.service",properties:{ActiveState:"active"},error:null,logs:[{at,priority:6,message:"Error: API failure"}]},
      {id:"dota2notes-monitor.timer",properties:{},error:"Cannot read timer snapshot",logs:[]},
      {id:"nginx.service",properties:{ActiveState:"failed",Result:"exit-code"},error:null,logs:[]},
      {id:"dota2notes-performance-reference.timer",properties:{ActiveState:"inactive",ExpectedActive:"no"},error:null,logs:[]},
    ] }];
    const errors = latestMonitorErrors(hosts,[{source:"sync",at,detail:"opendota_timeout"},{source:"other",at,detail:"unknown worker"}],Date.parse(at));
    expect(errors.find(error=>error.reason === "Error: API failure")).toMatchObject({hostId:"iran",unitId:"dota2notes-api.service",source:"journal",at});
    expect(errors.find(error=>error.reason === "Cannot read timer snapshot")).toMatchObject({hostId:"iran",at:null,unitId:"dota2notes-monitor.timer"});
    expect(errors.find(error=>error.unitId === "nginx.service")?.at).toBeNull();
    expect(errors.find(error=>error.reason === "opendota_timeout")).toMatchObject({hostId:"germany",unitId:"dota2notes-sync-daemon.service",source:"queue"});
    expect(errors.find(error=>error.reason === "unknown worker")?.hostId).toBeNull();
    expect(errors.some(error=>error.unitId.includes("performance-reference"))).toBe(false);
  });
});
