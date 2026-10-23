// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({api:vi.fn(),sync:vi.fn(),download:vi.fn(),progress:vi.fn(),token:vi.fn(()=>"secret-test-bearer")}));
vi.mock("../src/api",()=>({API_ORIGIN:"https://api.dota2notes.ir",apiRequest:mocks.api,getBearer:mocks.token,getSyncStatus:mocks.sync}));
vi.mock("../src/replays",()=>({validReplayId:(id:string)=>/^[1-9]\d{7,11}$/.test(id),replayNative:{download:mocks.download,progress:mocks.progress}}));
import {TaskManager,type AnalysisTask} from "../src/taskManager";
import {setConnection} from "../src/connection";
let manager:TaskManager;const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const task=(status:string):AnalysisTask=>({matchId:"9057632410",kind:"analysis",requestedAt:"2026-10-23T10:00:00Z",status,queueAhead:1,estimatedParseSeconds:60,progress:{phase:status==="completed"?"completed":"parsing",bytes:0,totalBytes:null,bytesPerSecond:0,attempts:1,nextTryAt:null,phaseStartedAt:null,heartbeatAt:null,retryDeadlineAt:null,errorCode:null}});
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();setConnection("online");mocks.progress.mockResolvedValue(vi.fn());mocks.api.mockImplementation(async(path:string)=>path==="/api/tasks"?{tasks:[]}:{downloadReady:true,status:"completed"});mocks.sync.mockResolvedValue({status:{manualJob:null}});manager=new TaskManager("owner-a");});
afterEach(()=>{manager.stop();vi.useRealTimers();});
describe("application-wide tasks",()=>{
 it("keeps a native download and status polling alive without a replay page mounted",async()=>{
  let finish!:(value:unknown)=>void;mocks.download.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  manager.start();await flush();await manager.download("9057632410");await flush();expect(mocks.download).toHaveBeenCalledOnce();expect(manager.snapshot().downloads[0].status).toBe("transferring");
  const count=mocks.api.mock.calls.filter(([path])=>path==="/api/tasks").length;await vi.advanceTimersByTimeAsync(6000);await flush();expect(mocks.api.mock.calls.filter(([path])=>path==="/api/tasks").length).toBeGreaterThan(count);
  finish({});await flush();expect(manager.snapshot().downloads[0].status).toBe("completed");expect(manager.snapshot().toast?.kind).toBe("download");expect(localStorage.getItem("dota-notes.tasks.v1.owner-a")).not.toContain("secret-test-bearer");
 });
 it("announces a live analysis completion once but never old completed history",async()=>{
  mocks.api.mockResolvedValueOnce({tasks:[task("completed")]});const update=vi.fn();window.addEventListener("dota-notes:matches-updated",update);
  try{manager.start();await flush();expect(manager.snapshot().toast).toBeNull();const pending={...task("pending"),requestedAt:"2026-10-23T11:00:00Z"};mocks.api.mockResolvedValue({tasks:[pending]});await vi.advanceTimersByTimeAsync(15000);await flush();
   mocks.api.mockResolvedValue({tasks:[{...pending,status:"completed"}]});await vi.advanceTimersByTimeAsync(3000);await flush();expect(manager.snapshot().toast?.kind).toBe("analysis");expect(update).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(15000);await flush();expect(update).toHaveBeenCalledOnce();
  }finally{window.removeEventListener("dota-notes:matches-updated",update);}
 });
 it("accepts multiple downloads but performs one native transfer at a time",async()=>{
  let finish!:(value:unknown)=>void;mocks.download.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));manager.start();await flush();await manager.download("9057632410");await flush();await manager.download("9056846985");await flush();expect(manager.snapshot().downloads).toHaveLength(2);expect(mocks.download).toHaveBeenCalledOnce();
  finish({});await flush();await vi.advanceTimersByTimeAsync(3000);await flush();expect(mocks.download).toHaveBeenCalledTimes(2);
 });
 it("restores accepted downloads only for their account and ignores callbacks after logout",async()=>{
  let finish!:(value:unknown)=>void;mocks.download.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));manager.start();await flush();await manager.download("9057632410");await flush();manager.stop();
  expect(new TaskManager("owner-a").snapshot().downloads[0].status).toBe("preparing");expect(new TaskManager("owner-b").snapshot().downloads).toHaveLength(0);finish({});await flush();expect(manager.snapshot().toast).toBeNull();
 });
 it("uses compressed network bytes and measured speed instead of invented progress",async()=>{
  let progress!:(value:{matchId:string;bytes:number;totalBytes:number})=>void;mocks.progress.mockImplementation(async callback=>{progress=callback;return vi.fn();});mocks.download.mockReturnValue(new Promise(()=>{}));manager.start();await flush();await manager.download("9057632410");await flush();
  await vi.advanceTimersByTimeAsync(1000);progress({matchId:"9057632410",bytes:1024,totalBytes:4096});expect(manager.snapshot().downloads[0]).toMatchObject({bytes:1024,totalBytes:4096,speed:1024});
 });
});
