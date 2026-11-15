// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AdminServices } from "../src/components/AdminMonitoring";
import { messages } from "../src/i18n";
import * as api from "../src/api";
import { setConnection } from "../src/connection";
import type { MonitorUnit, ServiceMonitor } from "../src/admin";

const now = new Date().toISOString();
const unit = (id: string): MonitorUnit => ({id,properties:{ActiveState:"active",SubState:"running"},logs:[],error:null});
function fixture(): ServiceMonitor {
  const website = unit("dota2notes.service");
  website.logs = [
    {at:now,priority:6,message:"Website listening"},
    {at:now,priority:4,message:"Warning: Slow upstream"},
    {at:now,priority:6,message:'{"level":"success","message":"Stored"}'},
    {at:now,priority:6,message:"Error: Broken action"},
  ];
  return {capturedAt:now,stale:false,snapshotError:null,units:[],queues:[],failures:[],hosts:[
    {id:"iran",label:"Iran VPS",capturedAt:now,stale:false,snapshotError:null,units:[unit("dota2notes-monitor.service"),website,unit("postgresql.service"),unit("nginx.service"),unit("dota2notes-api.service"),{...unit("dota2notes-monitor.timer"),properties:{ActiveState:"active",Schedule:'{"OnBootSec":"1min"}',NextRunAt:new Date(Date.now()+60000).toISOString()}}]},
    {id:"germany",label:"Germany VPS",capturedAt:now,stale:false,snapshotError:null,units:["monitor","images","sync-daemon","performance-reference","replay","link","api"].map(name=>unit(`dota2notes-${name}.service`))},
  ]};
}
beforeEach(()=>{setConnection("online");vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");vi.spyOn(api,"apiRequest").mockResolvedValue({monitor:fixture()} as never);});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("monitoring controls",()=>{
  it("orders services per host and uses the shared country assets",async()=>{
    const view=render(<AdminServices t={messages.fa}/>);
    await screen.findByRole("button",{name:/Website.*Running/});
    const titles=(selector:string)=>Array.from(view.container.querySelectorAll(`${selector} .service-card-title strong`)).map(node=>node.textContent);
    expect(titles(".service-grid-iran")).toEqual(["API","Website","Nginx","PostgreSQL","Service Monitor"]);
    expect(titles(".service-grid-germany")).toEqual(["API","Private Link","Replay Processing","Statistical Reference","Match Sync","Image Generation","Service Monitor"]);
    expect(view.container.querySelector<HTMLImageElement>(".service-host-iran img")?.getAttribute("src")).toBe("/flags/ir.svg");
    expect(screen.queryByText(/گزارش‌ها هر دقیقه ثبت می‌شوند/)).toBeNull();
    expect(screen.getByRole("heading",{name:"Processing Queues"})).toBeTruthy();
    const help=screen.getByRole("button",{name:"دربارهٔ Website"});
    help.focus();
    expect(document.activeElement).toBe(help);
    fireEvent.pointerDown(help,{pointerType:"mouse"});
    expect(document.activeElement).not.toBe(help);
  });
  it("filters each level independently, preserves source line numbers and copies only visible logs",async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator",{...navigator,clipboard:{writeText},onLine:true});
    render(<AdminServices t={messages.en}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Website.*Running/}));
    const log=screen.getByRole("log");
    expect(within(log).getByText("Website listening")).toBeTruthy();
    expect(within(log).getByText("Error: Broken action")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    for(const name of ["INFO","WARNING","SUCCESS"])fireEvent.click(screen.getByRole("button",{name,exact:true}));
    expect(within(log).queryByText("Website listening")).toBeNull();
    expect(within(log).getByLabelText("Line 4").textContent).toBe("4");
    fireEvent.click(screen.getByRole("button",{name:"Copy logs"}));
    await screen.findByText(messages.en.copied);
    expect(writeText.mock.calls[0][0]).toBe(`${now} [ERROR] Error: Broken action`);
    fireEvent.click(screen.getByRole("button",{name:"ERROR",exact:true}));
    expect(within(log).getByText("No log levels selected.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Select all"}));
    expect(within(log).getByText("Website listening")).toBeTruthy();
  });
  it("renders timer JSON as code and lists actual service errors with Latin times",async()=>{
    const view=render(<AdminServices t={messages.fa}/>);
    fireEvent.click(await screen.findByRole("button",{name:/^Monitor Schedule/}));
    expect(view.container.querySelector(".service-schedule .is-json")?.textContent).toContain('\n  "OnBootSec": "1min"\n');
    const errors=screen.getByRole("list",{name:"آخرین خطاها"});
    expect(within(errors).getByText("Error: Broken action")).toBeTruthy();
    expect(within(errors).getByRole("img",{name:"Iran VPS"})).toBeTruthy();
    const timestamps=view.container.querySelectorAll(".service-terminal time,.monitor-errors time");
    expect(timestamps.length).toBeGreaterThan(0);
    timestamps.forEach(time=>expect(time.textContent).not.toMatch(/[۰-۹٠-٩]/));
  });
});
