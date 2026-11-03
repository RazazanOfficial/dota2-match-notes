// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock("../src/api",()=>({API_ORIGIN:"https://example.test",apiRequest:mocks.api,getBearer:()=>"test",getSyncStatus:async()=>({status:{manualJob:null}})}));
vi.mock("../src/replays",()=>({validReplayId:()=>true,replayNative:{progress:async()=>()=>{}}}));
import {TaskProvider} from "../src/components/TaskCenter";
import {messages} from "../src/i18n";
import {setConnection} from "../src/connection";
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
describe("compact activity centre",()=>{
 it("closes on outside pointer, Escape and its close button without cancelling work",async()=>{
  setConnection("online");mocks.api.mockResolvedValue({tasks:[{matchId:"9057632410",kind:"analysis",requestedAt:"2026-10-24T12:00:00Z",status:"pending",queueAhead:2,estimatedParseSeconds:30,progress:{phase:"queued",attempts:1}}]});
  render(<TaskProvider owner="dock-test" live t={messages.en}><p>Workspace</p></TaskProvider>);
  const trigger=await screen.findByRole("button",{name:/Match analysis/});fireEvent.click(trigger);expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.pointerDown(document.body);expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger);fireEvent.keyDown(window,{key:"Escape"});expect(screen.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:messages.en.close}));expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button",{name:/Match analysis/})).toBeTruthy();expect(mocks.api.mock.calls.every(([path,options])=>path==="/api/tasks"&&(!options?.method||options.method==="GET"))).toBe(true);
 });
});
