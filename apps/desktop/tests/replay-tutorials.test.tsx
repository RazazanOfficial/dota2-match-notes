// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {ReplaySetupGuide} from "../src/components/ReplaySetupGuide";
import {Replay} from "../src/components/Replay";
import {messages} from "../src/i18n";
import {replayNative} from "../src/replays";
import {cacheOwner,clearOfflineAccount,setCacheOwner} from "../src/offlineCache";
import {setConnection} from "../src/connection";
const api=vi.hoisted(()=>vi.fn());
vi.mock("../src/api",async()=>({...await vi.importActual("../src/api"),apiRequest:api}));
const originalClipboard=Object.getOwnPropertyDescriptor(navigator,"clipboard");
const match={matchId:9033871443,heroId:8,won:false,position:1,score:76,analyzed:true,mode:"Ranked",duration:2345,startedAt:"2026-10-08T12:00:00Z"};
beforeEach(()=>{
 localStorage.clear();setCacheOwner("tutorial-test");setConnection("online");api.mockReset();
 vi.spyOn(replayNative,"available").mockReturnValue(true);
 vi.spyOn(replayNative,"settings").mockResolvedValue({dotaPath:"E:\\Dota",replayPath:"E:\\Dota\\game\\dota\\replays"});
 vi.spyOn(replayNative,"files").mockResolvedValue([{matchId:String(match.matchId),path:"replay.dem",sizeBytes:1048576,modifiedSeconds:1}]);
 vi.spyOn(replayNative,"progress").mockResolvedValue(vi.fn());
 Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});
 api.mockImplementation(async(path:string)=>path.startsWith("/api/matches/me?") ? {rows:[]} : {match,status:"pending",archived:false});
});
afterEach(()=>{cleanup();clearOfflineAccount();vi.restoreAllMocks();if(originalClipboard)Object.defineProperty(navigator,"clipboard",originalClipboard);else delete (navigator as unknown as {clipboard?:Clipboard}).clipboard;});
describe("replay metadata and screenshot tutorials",()=>{
 it.each([messages.fa,messages.en])("uses the shared first screenshot, copies the launch option and closes accessibly",async(t)=>{
  render(<ReplaySetupGuide t={t} kind="playback"/>);const trigger=screen.getByRole("button");trigger.focus();fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog");expect(document.body.style.overflow).toBe("hidden");
  expect(within(dialog).getByRole("img").getAttribute("src")).toContain("/replay-folder/");
  fireEvent.click(within(dialog).getByRole("button",{name:t.next}));fireEvent.click(within(dialog).getByRole("button",{name:t.next}));
  expect(within(dialog).getByRole("img").getAttribute("src")).toContain("/replay-playback/");
  fireEvent.click(within(dialog).getByRole("button",{name:`${t.copy} -console`}));
  await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalledWith("-console"));
  expect(dialog.querySelector(".setup-caption")).toBeNull();expect(dialog.querySelector("footer")).toBeNull();
  expect(dialog.querySelector(".tutorial-command strong,.tutorial-command small")).toBeNull();
  const previous=within(dialog).getByRole("button",{name:t.previous}),next=within(dialog).getByRole("button",{name:t.next});
  expect(previous.className).toContain(t===messages.fa ? "on-right" : "on-left");expect(next.className).toContain(t===messages.fa ? "on-left" : "on-right");
  expect(previous.textContent).toBe("");expect(next.textContent).toBe("");
  fireEvent.click(within(dialog).getByRole("button",{name:`6. ${t===messages.fa ? "دستور ریپلی را کپی کن" : "Copy the replay command"}`}));
  expect(within(dialog).getByRole("img").getAttribute("src")).toBe(`/tutorials/replay-playback/${t===messages.fa ? "fa" : "en"}/step-06.png`);
  expect(dialog.textContent).not.toContain(t===messages.fa ? "دستور ریپلی را کپی کن" : "Copy the replay command");
  fireEvent.error(within(dialog).getByRole("img"));expect(dialog.querySelector(".tutorial-image-pending")?.textContent).toBe("");
  fireEvent.keyDown(window,{key:"Escape"});expect(screen.queryByRole("dialog")).toBeNull();expect(document.body.style.overflow).toBe("");expect(document.activeElement).toBe(trigger);
 });
 it.each([messages.fa,messages.en])("groups the two tutorials separately from the native folder action",async(t)=>{
  const choose=vi.spyOn(replayNative,"chooseFolder").mockResolvedValue(null);render(<Replay t={t} live/>);
  const group=screen.getByRole("group",{name:t===messages.fa ? "آموزش‌های ریپلی" : "Replay tutorials"});
  expect(within(group).getAllByRole("button")).toHaveLength(2);
  const folder=screen.getByRole("button",{name:t===messages.fa ? "بازکردن پوشه" : "Open folder"});
  expect(group.contains(folder)).toBe(false);expect(folder.className).toContain("primary-button");
  fireEvent.click(within(group).getAllByRole("button")[0]);expect(choose).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:t.close}));await act(async()=>{});
  fireEvent.click(folder);await waitFor(()=>expect(choose).toHaveBeenCalledOnce());
 });
 it.each([messages.fa,messages.en])("shows real metadata and copies the exact command in search and downloaded tabs",async(t)=>{
  render(<Replay t={t} live/>);
  fireEvent.change(screen.getByRole("textbox",{name:t.matchId}),{target:{value:String(match.matchId)}});
  fireEvent.click(screen.getByRole("button",{name:t.replaySearch}));
  await waitFor(()=>expect(screen.getByRole("img",{name:"Juggernaut"})).toBeTruthy());
  const search=screen.getByRole("table",{name:t.replaySearch});
  expect(search.textContent).toContain("39:05");expect(search.textContent).toContain("76");expect(search.textContent).toContain("L");
  fireEvent.click(within(search).getByRole("button",{name:`${t.copy} ${t.playCommand}`}));
  await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`playdemo replays/${match.matchId}`));
  fireEvent.click(screen.getByRole("tab",{name:new RegExp(t.localReplays)}));
  const local=await screen.findByRole("table",{name:t.localReplays});
  await waitFor(()=>expect(within(local).getByRole("img",{name:"Juggernaut"})).toBeTruthy());
  expect(within(local).getAllByRole("columnheader")).toHaveLength(8);expect(local.textContent).toContain("39:05");
  expect(api.mock.calls.some(([,options])=>options?.body?.includes('"intent"'))).toBe(false);
 });
 it("keeps a local file and its command available when metadata is unavailable",async()=>{
  api.mockImplementation(async(path:string)=>path.startsWith("/api/matches/me?") ? {rows:[]} : Promise.reject(new Error("not found")));
  render(<Replay t={messages.en} live/>);fireEvent.click(screen.getByRole("tab",{name:/Downloaded replays/}));
  const table=await screen.findByRole("table",{name:messages.en.localReplays});
  expect(table.textContent).toContain(`playdemo replays/${match.matchId}`);
  await act(async()=>{});expect(table.textContent).not.toContain("W");expect(table.textContent).not.toContain("Ranked");
  expect(screen.queryByRole("alert")).toBeNull();expect(cacheOwner()).toBe("tutorial-test");
 });
 it("restores account-scoped metadata offline without requesting a replay",async()=>{
  const first=render(<Replay t={messages.en} live/>);fireEvent.click(screen.getByRole("tab",{name:/Downloaded replays/}));
  const table=await screen.findByRole("table",{name:messages.en.localReplays});
  await waitFor(()=>expect(within(table).getByRole("img",{name:"Juggernaut"})).toBeTruthy());first.unmount();api.mockClear();setConnection("offline");
  render(<Replay t={messages.en} live/>);fireEvent.click(screen.getByRole("tab",{name:/Downloaded replays/}));
  const cached=await screen.findByRole("table",{name:messages.en.localReplays});
  await waitFor(()=>expect(cached.textContent).toContain("76"));expect(cached.textContent).toContain("39:05");
  expect(api.mock.calls.filter(([path])=>path.startsWith("/api/replays/")).length).toBe(0);
 });
 it("limits metadata reads to visible files, with two concurrent reads and no POST",async()=>{
  const files=Array.from({length:21},(_,i)=>({matchId:String(9100000000+i),path:"file.dem",sizeBytes:1,modifiedSeconds:1}));
  vi.mocked(replayNative.files).mockResolvedValue(files);
  let active=0,max=0;
  api.mockImplementation(async(path:string,options?:RequestInit)=>{
   if(path.startsWith("/api/matches/me?"))return {rows:[]};
   expect(options?.method).toBeUndefined();active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
   return {match:{...match,matchId:Number(path.split("/").at(-1))}};
  });
  const view=render(<Replay t={messages.en} live/>);fireEvent.click(screen.getByRole("tab",{name:/Downloaded replays/}));
  await waitFor(()=>expect(view.container.querySelectorAll('[data-replay-match]')).toHaveLength(10));
  await waitFor(()=>expect(api.mock.calls.filter(([path])=>path.startsWith("/api/replays/")).length).toBe(10));
  await waitFor(()=>expect(active).toBe(0));expect(max).toBe(2);
  fireEvent.click(screen.getByRole("button",{name:messages.en.loadMore}));
  await waitFor(()=>expect(view.container.querySelectorAll('[data-replay-match]')).toHaveLength(20));
  await waitFor(()=>expect(api.mock.calls.filter(([path])=>path.startsWith("/api/replays/")).length).toBe(20));
 });
});
