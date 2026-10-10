// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/App";
import { Admin } from "../src/components/Admin";
import { Profile } from "../src/components/Profile";
import { previewProfile } from "../src/components/Shared";
import { messages } from "../src/i18n";
import * as api from "../src/api";
import { unitState, useAccountRead, type AccountProfile, type AdminUser } from "../src/admin";
import { cacheableRead, cachedWrite, clearOfflineAccount, setCacheOwner } from "../src/offlineCache";
import { setConnection } from "../src/connection";
const user: AdminUser = {id:"00000000-0000-4000-8000-000000000001",handle:"steam_42",displayName:"Player Forty Two",steamId:"76561197960265770",steamAccountId:42,avatarUrl:null,hasPassword:true,isAdmin:false,isSuperAdmin:false,createdAt:"2026-10-01T00:00:00Z",lastLoginAt:null,lastManualSyncAt:null};
const profile: AccountProfile = {user:{...user,lastScheduledSyncAt:null,onboardingCompletedAt:"2026-10-01T00:00:00Z",hasVerifiedEmail:true,hasSavedRecoveryCodes:true},stats:{total:2,wins:1,losses:1,analyzed:1,winRate:50},recent:[]};
const overview = {counts:{users:1,usersWithLogin:1,databaseAdmins:0,activeSessions:1,journalMatches:2,cachedDotaMatches:2,generatedImages:0,generatedImageBytes:0,adminAuditLogs:0,newUsersToday:0,analyzedMatchesToday:0},imageJobs:{pending:0},syncJobs:{pending:0},openDotaUsage:[],analytics:{daily:[]},recentAuditLogs:[],recentImageJobs:[]};
beforeEach(()=>{localStorage.clear();clearOfflineAccount();setCacheOwner("test-owner");setConnection("online");vi.stubGlobal("scrollTo",vi.fn());vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");});
afterEach(()=>{cleanup();clearOfflineAccount();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function requests() {
  return vi.spyOn(api,"apiRequest").mockImplementation(async(path,init)=>{
    if (init?.method && init.method!=="GET") return {created:true,user,refreshed:[{dotaMatchId:"9036364671"}],failed:[],deleted:1} as never;
    if (path.startsWith("/api/admin/overview")) return {overview} as never;
    if (path.startsWith("/api/admin/users?")) return {users:[user],total:1} as never;
    if (path.startsWith("/api/admin/users/") || path === "/api/profile/me") return {profile} as never;
    if (path.startsWith("/api/admin/service-monitor")) return {monitor:{capturedAt:new Date().toISOString(),stale:false,snapshotError:null,units:[{id:"dota2notes-api.service",properties:{ActiveState:"active",SubState:"running",Result:"success"},logs:[{at:"2026-10-10T07:00:00Z",priority:6,message:"API listening"}],error:null}],queues:[],failures:[]}} as never;
    if(path.startsWith("/api/admin/replay-archive"))return {prefix:"replays/",folders:[],files:[{key:"replays/2026/10/10/9036364671.dem.bz2",bytes:1000}],nextToken:null} as never;
    if(path.startsWith("/api/admin/monthly-references"))return {versions:[]} as never;
    throw new Error(`Unexpected test request: ${path}`);
  });
}
describe("profile and sidebar navigation",()=>{
  it("moves product destinations into the sidebar, keeps settings last, and opens a full profile",async()=>{
    const view=render(<App session={previewProfile}/>);
    const nav=screen.getByRole("navigation");
    expect(within(nav).getAllByRole("button").map(b=>b.textContent)).toEqual(["Dashboard","Matches","Replay","Smart reports","Meta","Coach","Learn & Practice","Settings"]);
    expect(view.container.querySelector(".shortcut-grid")).toBeNull();
    expect(screen.queryByRole("button",{name:"Administration"})).toBeNull();
    fireEvent.click(view.container.querySelector<HTMLButtonElement>(".sidebar-account")!);
    expect(await screen.findByRole("heading",{name:"My profile"})).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows the independent admin badge only for the authorized account",async()=>{
    render(<App session={{...previewProfile,isSuperAdmin:true}}/>);
    fireEvent.click(screen.getByRole("button",{name:"Administration"}));
    expect(await screen.findByRole("heading",{name:"Administration"})).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(7);
  });
  it("keeps a known profile readable offline without exposing admin data to the cache",async()=>{
    cachedWrite("/api/profile/me",{profile});setConnection("offline");
    const request=vi.spyOn(api,"apiRequest");
    render(<Profile session={{...previewProfile,steamId:profile.user.steamId,steamAccountId:42}} t={messages.en} live/>);
    expect(screen.getByText("Player Forty Two")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    expect(cacheableRead("/api/profile/me")).toBe(true);
    expect(cacheableRead("/api/admin/users?query=")).toBe(false);
    expect(cacheableRead("/api/admin/service-monitor")).toBe(false);
  });
});
describe("admin operations",()=>{
  it("loads only the selected tab and displays real account details",async()=>{
    const request=requests();
    render(<Admin session={{...previewProfile,isSuperAdmin:true}} t={messages.en} live/>);
    await screen.findByRole("heading",{name:"Activity trends"});
    expect(request.mock.calls.map(call=>call[0])).toEqual(["/api/admin/overview?range=30"]);
    fireEvent.click(screen.getByRole("tab",{name:"Users"}));
    await screen.findByText("Player Forty Two");
    fireEvent.click(screen.getByRole("button",{name:/Player Forty Two/}));
    const dialog=await screen.findByRole("dialog");
    await waitFor(()=>expect(within(dialog).getByText("Steam account ID")).toBeTruthy());
    expect(request.mock.calls.some(call=>call[0]===`/api/admin/users/${user.id}`)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dialog).getByRole("button",{name:"Close"}));
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(request.mock.calls.some(call=>call[0].includes("service-monitor"))).toBe(false);
  });
  it("submits a bounded match refresh only after choosing a user",async()=>{
    const request=requests();
    render(<Admin session={{...previewProfile,isSuperAdmin:true}} t={messages.en} live/>);
    fireEvent.click(screen.getByRole("tab",{name:"Users"}));
    fireEvent.click(await screen.findByRole("button",{name:"Refresh matches"}));
    const dialog=screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Number of matches"),{target:{value:"21"}});
    expect(within(dialog).getByRole("button",{name:messages.en.save})).toHaveProperty("disabled",true);
    fireEvent.change(within(dialog).getByLabelText("Number of matches"),{target:{value:"3"}});
    fireEvent.click(within(dialog).getByRole("button",{name:messages.en.save}));
    await within(dialog).findByText("Changes saved.");
    expect(request).toHaveBeenCalledWith(`/api/admin/users/${user.id}/matches/reprocess`,{method:"POST",body:'{"count":3}'},180000);
  });
  it("requires matching passwords and separate consent for removal",async()=>{
    const request=requests();render(<Admin session={{...previewProfile,isSuperAdmin:true}} t={messages.en} live/>);
    fireEvent.click(screen.getByRole("tab",{name:"Users"}));fireEvent.click(await screen.findByRole("button",{name:"Password"}));
    const dialog=screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("New password"),{target:{value:"NewTest123!"}});
    fireEvent.change(within(dialog).getByLabelText("Confirm password"),{target:{value:"Wrong123!"}});
    expect(within(dialog).getByRole("button",{name:messages.en.save})).toHaveProperty("disabled",true);
    expect(within(dialog).getAllByRole("button",{name:"Show password"})).toHaveLength(2);
    fireEvent.change(within(dialog).getByLabelText("Confirm password"),{target:{value:"NewTest123!"}});
    fireEvent.click(within(dialog).getByRole("button",{name:messages.en.save}));await within(dialog).findByText("Changes saved.");
    expect(request).toHaveBeenCalledWith(`/api/admin/users/${user.id}/password`,{method:"PUT",body:JSON.stringify({password:"NewTest123!",confirmPassword:"NewTest123!"})},12000);
    expect(within(dialog).getByRole("button",{name:"Remove password"})).toHaveProperty("disabled",true);
    fireEvent.click(within(dialog).getByRole("checkbox",{name:"I confirm removing the password and disabling password sign-in."}));
    fireEvent.click(within(dialog).getByRole("button",{name:"Remove password"}));
    await waitFor(()=>expect(within(dialog).queryByRole("button",{name:"Remove password"})).toBeNull());
    expect(request).toHaveBeenCalledWith(`/api/admin/users/${user.id}/password`,{method:"DELETE"},12000);
  });
  it("requires explicit confirmation before an archive delete request",async()=>{
    const request=requests();render(<Admin session={{...previewProfile,isSuperAdmin:true}} t={messages.en} live/>);
    fireEvent.click(screen.getByRole("tab",{name:"Archive"}));fireEvent.click(await screen.findByRole("button",{name:/Delete file/}));
    const dialog=screen.getByRole("dialog");expect(within(dialog).getByRole("button",{name:"Delete",exact:true})).toHaveProperty("disabled",true);
    expect(request.mock.calls.some(([,init])=>init?.method==="POST")).toBe(false);
    fireEvent.click(within(dialog).getByRole("checkbox"));fireEvent.click(within(dialog).getByRole("button",{name:"Delete",exact:true}));
    await screen.findByText("1 files deleted.");
    expect(request).toHaveBeenCalledWith("/api/admin/replay-archive",{method:"POST",body:'{"key":"replays/2026/10/10/9036364671.dem.bz2"}'},180000);
  });
  it("distinguishes a successful idle worker from a stopped API",()=>{
    const properties={ActiveState:"inactive",SubState:"dead",Result:"success",ExecMainStatus:"0"};
    expect(unitState({id:"dota2notes-sync.service",properties,logs:[],error:null})).toBe("completed");
    expect(unitState({id:"dota2notes-api.service",properties,logs:[],error:null})).toBe("inactive");
    expect(unitState({id:"dota2notes-replay.service",properties:{...properties,Result:"exit-code"},logs:[],error:null})).toBe("failed");
  });
  it("keeps queue statistics visible when no service snapshot exists",async()=>{
    const request=requests(), original=request.getMockImplementation()!;
    request.mockImplementation(async(path,init,timeout)=>path==="/api/admin/service-monitor" ? {monitor:{capturedAt:null,stale:true,snapshotError:"unavailable",units:[],queues:[{source:"sync",status:"failed",total:2}],failures:[]}} as never : original(path,init,timeout));
    render(<Admin session={{...previewProfile,isSuperAdmin:true}} t={messages.en} live/>);
    fireEvent.click(screen.getByRole("tab",{name:"Services"}));
    expect(await screen.findByText(/The service snapshot is unavailable or stale/)).toBeTruthy();
    expect(screen.getByText("sync · Failed")).toBeTruthy();
    expect(screen.getByRole("heading",{name:"Processing queues"})).toBeTruthy();
  });
  it("preserves a release's formatted content and requires consent before publishing",async()=>{
    const release={id:"release-one",version:"3.2.1",title:"Release title",summary:"Existing summary",status:"draft",content:{type:"doc",content:[{type:"heading",attrs:{level:2},content:[{type:"text",text:"Formatted heading"}]},{type:"paragraph",content:[{type:"text",marks:[{type:"bold"}],text:"Keep this bold text"}]}]}};
    const request=requests(), original=request.getMockImplementation()!;
    request.mockImplementation(async(path,init,timeout)=>{
      if(path==="/api/admin/releases")return {releases:[release]} as never;
      if(path==="/api/admin/releases/release-one")return {release} as never;
      return original(path,init,timeout);
    });
    render(<Admin session={{...previewProfile,isSuperAdmin:true}} t={messages.en} live/>);
    fireEvent.click(screen.getByRole("tab",{name:"Releases"}));
    await screen.findByRole("option",{name:/3.2.1/});
    fireEvent.change(screen.getByLabelText("Select release"),{target:{value:release.id}});
    await screen.findByText("Keep this bold text");
    fireEvent.change(screen.getByLabelText("Status"),{target:{value:"published"}});
    expect(screen.getByRole("button",{name:"Save release"})).toHaveProperty("disabled",true);
    expect(request.mock.calls.some(([,init])=>init?.method==="PUT")).toBe(false);
    fireEvent.click(screen.getByRole("checkbox",{name:"I confirm publishing these release notes publicly."}));
    fireEvent.click(screen.getByRole("button",{name:"Save release"}));
    await screen.findByText("Changes saved.");
    const sent=request.mock.calls.find(([,init])=>init?.method==="PUT")!;
    expect(sent[0]).toBe("/api/admin/releases/release-one");
    const body=JSON.parse(String(sent[1]?.body));
    expect(body.status).toBe("published");
    expect(body.content).toEqual(release.content);
  });
  it("does not request privileged endpoints for a regular user",()=>{
    const request=requests();render(<Admin session={previewProfile} t={messages.en} live/>);
    expect(screen.getByRole("alert").textContent).toContain("authorized administrator");expect(request).not.toHaveBeenCalled();
  });
});
describe("admin polling lifecycle",()=>{
  it("serializes requests and does not poll after the view unmounts",async()=>{
    vi.useFakeTimers();let resolve!: (value:unknown)=>void;
    const request=vi.spyOn(api,"apiRequest").mockImplementation(()=>new Promise(r=>{resolve=r;}) as never);
    const view=renderHook(()=>useAccountRead("/api/admin/service-monitor",true,30000));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async()=>{window.dispatchEvent(new Event("focus"));await vi.advanceTimersByTimeAsync(60000);});
    expect(request).toHaveBeenCalledTimes(1);
    await act(async()=>{resolve({monitor:{}});await Promise.resolve();});
    view.unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("discards privileged data immediately when access is revoked",async()=>{
    const request=vi.spyOn(api,"apiRequest").mockResolvedValueOnce({private:true} as never).mockRejectedValue(new api.ApiError("Forbidden",403,"super_admin_required"));
    const view=renderHook(()=>useAccountRead<{private:boolean}>("/api/admin/service-monitor",true,30000));
    await waitFor(()=>expect(view.result.current.data?.private).toBe(true));
    act(()=>view.result.current.refresh());
    await waitFor(()=>expect(view.result.current.error).toBeInstanceOf(api.ApiError));
    expect(view.result.current.data).toBeNull();expect(request).toHaveBeenCalledTimes(2);
  });
});
