// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {useRows} from "../src/components/LiveWorkspace";
import {MatchTable} from "../src/components/Workspace";
import {sampleHistory,summarize,SAMPLE_DATE,type HistoryMatch} from "../src/history";
import {messages} from "../src/i18n";
import {clearOfflineAccount,setCacheOwner} from "../src/offlineCache";
import {setConnection} from "../src/connection";
const mock=vi.hoisted(()=>({list:vi.fn(),api:vi.fn()}));
vi.mock("../src/api",async()=>({...await vi.importActual("../src/api"),listMatches:mock.list,apiRequest:mock.api}));
const failed={...sampleHistory[0],analyzed:false,analysisStatus:"failed" as const,analysisPreparation:{replay:"failed",errorCode:"replay_parser_failed"}};
const working={...failed,analysisStatus:"processing" as const,analysisPreparation:{replay:"processing"}};
const ready={...failed,analyzed:true,analysisStatus:"ready" as const,analysisPreparation:null,score:89,position:5};
const response=(row:HistoryMatch)=>({ok:true,rows:[row],total:1,page:1,pageSize:10,summary:summarize([row])});
function View(){const {data}=useRows({period:"week",anchor:SAMPLE_DATE,page:1,query:"",mode:"all",position:"all"});return data ? <MatchTable matches={data.rows} t={messages.en} onOpen={vi.fn()} live/> : null;}
async function flush(){await act(async()=>{await Promise.resolve();});}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();clearOfflineAccount();setCacheOwner("refresh-test");setConnection("online");mock.api.mockResolvedValue({preparation:{replay:"pending"}});mock.list.mockResolvedValue(response(ready));});
afterEach(()=>{cleanup();clearOfflineAccount();vi.useRealTimers();vi.restoreAllMocks();});
describe("live analysis refresh",()=>{
 it("rechecks a failed row immediately after an accepted retry and shows completion without restarting",async()=>{
  mock.list.mockResolvedValueOnce(response(failed)).mockResolvedValueOnce(response(working)).mockResolvedValue(response(ready));
  render(<View/>);await flush();fireEvent.click(screen.getByRole("button",{name:messages.en.analysisError}));fireEvent.click(screen.getByRole("button",{name:messages.en.analysisRetryAction}));await flush();
  expect(screen.getByRole("button",{name:messages.en.analysisQueued})).toBeTruthy();expect(mock.list).toHaveBeenCalledTimes(2);
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.getByRole("button",{name:messages.en.analysisDone})).toBeTruthy();expect(screen.getByText("89")).toBeTruthy();
 });
 it("continues after a transient poll failure and refreshes when the window gains focus",async()=>{
  mock.list.mockResolvedValueOnce(response(working)).mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValue(response(ready));
  render(<View/>);await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(mock.list).toHaveBeenCalledTimes(2);
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(screen.getByRole("button",{name:messages.en.analysisDone})).toBeTruthy();
  fireEvent.focus(window);await flush();expect(mock.list).toHaveBeenCalledTimes(4);
 });
 it("serializes simultaneous refresh events and stops polling after unmount",async()=>{
  let finish!:(value:ReturnType<typeof response>)=>void;
  mock.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const view=render(<View/>);
  fireEvent.focus(window);window.dispatchEvent(new Event("dota-notes:matches-updated"));expect(mock.list).toHaveBeenCalledTimes(1);
  await act(async()=>{finish(response(working));});await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(mock.list).toHaveBeenCalledTimes(2);
  view.unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});fireEvent.focus(window);expect(mock.list).toHaveBeenCalledTimes(2);
 });
 it("keeps cached data offline and resumes immediately on reconnection",async()=>{
  const view=render(<View/>);await flush();await act(async()=>{setConnection("offline");});await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});expect(mock.list).toHaveBeenCalledTimes(1);expect(screen.getByRole("button",{name:messages.en.analysisDone})).toBeTruthy();
  await act(async()=>{setConnection("online");});expect(mock.list).toHaveBeenCalledTimes(2);view.unmount();
 });
});
