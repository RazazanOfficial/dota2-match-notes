// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,within,waitFor} from "@testing-library/react";
import {ReplaySetupGuide} from "../src/components/ReplaySetupGuide";
import {Replay} from "../src/components/Replay";
import {LaunchDota} from "../src/components/LaunchDota";
import {messages} from "../src/i18n";
import {replayNative} from "../src/replays";
import {setConnection} from "../src/connection";
import {clearOfflineAccount,setCacheOwner} from "../src/offlineCache";
import {sampleHistory} from "../src/history";
const api=vi.hoisted(()=>vi.fn());
beforeEach(()=>{localStorage.clear();clearOfflineAccount();setCacheOwner('replay-setup-test');});
vi.mock("../src/api",async()=>({...await vi.importActual("../src/api"),apiRequest:api,getBearer:()=>"test-token"}));
beforeEach(()=>{setConnection("online");vi.spyOn(replayNative,"available").mockReturnValue(true);vi.spyOn(replayNative,"settings").mockResolvedValue({dotaPath:"E:\\Steam\\dota 2 beta",replayPath:"E:\\Steam\\dota 2 beta\\game\\dota\\replays"});vi.spyOn(replayNative,"files").mockResolvedValue([]);vi.spyOn(replayNative,"progress").mockResolvedValue(vi.fn());api.mockReset();});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
async function flush(){await act(async()=>{await Promise.resolve();if(vi.isFakeTimers())await vi.advanceTimersByTimeAsync(50);});}
describe("replay setup",()=>{
 it('does not display another query history offline and restores only the matching cache',async()=>{
  vi.useFakeTimers();const row=sampleHistory[0];api.mockResolvedValue({rows:[row],total:100});
  const view=render(<Replay t={messages.en} live/>);await flush();
  expect(view.container.querySelector(`[data-replay-match="${row.id}"]`)).toBeTruthy();
  await act(async()=>{setConnection('offline');});
  fireEvent.change(screen.getByRole('textbox',{name:messages.en.search}),{target:{value:'new-query'}});await flush();
  expect(view.container.querySelector('[data-replay-match]')).toBeNull();
  expect(screen.queryByText(/\/ 4/)).toBeNull();
  fireEvent.change(screen.getByRole('textbox',{name:messages.en.search}),{target:{value:''}});await flush();
  expect(view.container.querySelector(`[data-replay-match="${row.id}"]`)).toBeTruthy();
 });
 it.each([messages.fa,messages.en])('includes null positions and missing metadata in the unknown local replay filter',async(t)=>{
  const unknown='9033813921',known='9033813922',missing='9033813923';
  vi.spyOn(replayNative,'files').mockResolvedValue([unknown,known,missing].map(matchId=>({matchId,path:`${matchId}.dem`,sizeBytes:100,modifiedSeconds:1})));
  api.mockImplementation(async(path:string)=>path.startsWith('/api/matches/me?')?{rows:[]}:path.includes(missing)?{match:null}:{match:{matchId:path.includes(known)?known:unknown,heroId:null,won:null,position:path.includes(known)?1:null,score:null,analyzed:false,mode:null,duration:null,startedAt:null}});
  const view=render(<Replay t={t} live/>);fireEvent.click(screen.getAllByRole('tab').find(tab=>tab.textContent?.includes(t.localReplays))!);
  await waitFor(()=>expect(api.mock.calls.some(([path])=>path===`/api/replays/${known}`)).toBe(true));
  await waitFor(()=>expect(view.container.querySelectorAll('[data-replay-match]')).toHaveLength(3));
  fireEvent.click(screen.getByRole('button',{name:t.position}));fireEvent.click(within(screen.getByRole('dialog',{name:t.position})).getByRole('button',{name:t.unknownPosition}));
  await waitFor(()=>expect(view.container.querySelector(`[data-replay-match="${known}"]`)).toBeNull());
  expect(view.container.querySelector(`[data-replay-match="${unknown}"]`)).toBeTruthy();expect(view.container.querySelector(`[data-replay-match="${missing}"]`)).toBeTruthy();
 });
 it.each([messages.fa,messages.en])("provides six localized screenshots with arrow-only navigation",(t)=>{
  render(<ReplaySetupGuide t={t}/>);fireEvent.click(screen.getByRole("button"));const dialog=screen.getByRole("dialog");
  for(let index=0;index<6;index++) {expect(within(dialog).getByRole("img")).toBeTruthy();expect(within(dialog).getByRole("img").getAttribute("src")).toBe(`/tutorials/replay-folder/${t===messages.fa ? "fa" : "en"}/step-${String(index+1).padStart(2,"0")}.png`);if(index<5)fireEvent.click(within(dialog).getByRole("button",{name:t.next}));}
  expect(within(dialog).getByRole("button",{name:t.next})).toHaveProperty("disabled",true);expect(dialog.querySelector("footer")).toBeNull();fireEvent.click(within(dialog).getByRole("button",{name:t.close}));expect(screen.queryByRole("dialog")).toBeNull();
 });
 it("keeps folder selection locked until the queued native transfer completes",async()=>{
  vi.useFakeTimers();let gets=0;api.mockImplementation(async(path:string,options?:{method?:string})=>path.startsWith("/api/matches/me?") ? {rows:[]} : options?.method ? {} : {archived:++gets>1,status:"pending"});
  let finish!:(v:unknown)=>void;const download=vi.spyOn(replayNative,"download").mockImplementation(()=>new Promise(resolve=>{finish=resolve as typeof finish;}));
  render(<Replay t={messages.en} live/>);await flush();fireEvent.change(screen.getByRole("textbox",{name:messages.en.matchId}),{target:{value:"9033813921"}});fireEvent.click(screen.getByRole("button",{name:messages.en.replaySearch}));await flush();fireEvent.click(screen.getByRole("button",{name:messages.en.download}));await flush();
  expect(download).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole("button",{name:messages.en.dotaFolder}));expect(screen.getByRole("button",{name:"Open folder"})).toHaveProperty("disabled",true);
  await act(async()=>{finish({matchId:"9033813921"});});await flush();expect(screen.getByRole("tab",{name:/Downloaded replays/}).getAttribute("aria-selected")).toBe("false");expect(screen.getByRole("button",{name:"Open folder"})).toHaveProperty("disabled",false);
 });
 it("shows a helpful local storage error without displaying a programming exception",async()=>{
  api.mockImplementation(async(path:string)=>path.startsWith("/api/matches/me?") ? {rows:[]} : {archived:true});vi.spyOn(replayNative,"download").mockRejectedValue({code:"replay_folder_write_failed"});render(<Replay t={messages.en} live/>);await flush();
  fireEvent.change(screen.getByRole("textbox",{name:messages.en.matchId}),{target:{value:"9033813921"}});fireEvent.click(screen.getByRole("button",{name:messages.en.replaySearch}));await flush();fireEvent.click(screen.getByRole("button",{name:messages.en.download}));await flush();expect(screen.getByRole("alert").textContent).toContain("not writable");expect(screen.getByRole("alert").textContent).not.toContain("replay_folder_write_failed");
 });
 it("launches Steam even when the API is offline without requiring a game folder",async()=>{
  setConnection("offline");const launch=vi.spyOn(replayNative,"launchDota").mockResolvedValue();render(<LaunchDota t={messages.en}/>);fireEvent.click(screen.getByRole("button",{name:"Launch Dota 2"}));await flush();expect(launch).toHaveBeenCalledOnce();expect(api).not.toHaveBeenCalled();expect(screen.getByRole("status").textContent).toContain("sent to Steam");
 });
});
