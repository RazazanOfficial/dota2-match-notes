// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
const mocks=vi.hoisted(()=>({api:vi.fn(),download:vi.fn(),progress:vi.fn(),invoke:vi.fn(),listen:vi.fn(),native:false}));
vi.mock('../src/api',()=>({API_ORIGIN:'https://api.dota2notes.ir',apiRequest:mocks.api,getBearer:()=> 'test',getSyncStatus:async()=>({status:{manualJob:null}})}));
vi.mock('../src/replays',()=>({validReplayId:(s:string)=>/^\d{10}$/.test(s),replayNative:{download:mocks.download,progress:mocks.progress}}));
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>mocks.native,invoke:mocks.invoke}));
vi.mock('@tauri-apps/api/event',()=>({listen:mocks.listen}));
import {TaskManager,type AnalysisTask} from '../src/taskManager';
import {setConnection} from '../src/connection';

import {projectMatch} from '../src/useLiveMatch';
import {sampleHistory} from '../src/history';
import {AssetGate} from '../src/components/AssetGate';
import {messages} from '../src/i18n';
let manager:TaskManager|undefined;const flush=async()=>{for(let n=0;n<15;n++)await Promise.resolve()};
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();setConnection('online');mocks.native=false;mocks.progress.mockResolvedValue(()=>{});mocks.listen.mockResolvedValue(()=>{});mocks.download.mockReturnValue(new Promise(()=>{}));});
afterEach(()=>{manager?.stop();manager=undefined;cleanup();vi.useRealTimers();vi.unstubAllGlobals()});
describe('shared task state and independent transfers',()=>{
 it.each(['same','different'])('starts a %s replay download while analysis status is stalled',async(kind)=>{
  const matchId=kind==='same'?'9070000001':'9070000010';
  mocks.api.mockImplementation((path:string,options?:{method?:string})=>options?.method?Promise.resolve({}):path==='/api/tasks'?new Promise(()=>{}):Promise.resolve({directDownloadReady:true,archived:true,status:'processing'}));
  manager=new TaskManager('test',true,false);manager.start();await flush();await manager.download(matchId);await flush();expect(mocks.download).toHaveBeenCalledWith(matchId,'test','https://api.dota2notes.ir');
 });
 it('does not resurrect old persisted failed or day-old waiting downloads',()=>{localStorage.setItem('dota-notes.tasks.v1.test',JSON.stringify([{matchId:'9070000001',status:'preparing',requestedAt:Date.now()-86400001},{matchId:'9070000002',status:'failed',requestedAt:Date.now()}]));manager=new TaskManager('test');expect(manager.snapshot().downloads).toEqual([])});
 it('uses the newest server revision across views',()=>{
  const progress={phase:'parsing',bytes:0,totalBytes:null,bytesPerSecond:0,attempts:1,nextTryAt:null,phaseStartedAt:null,heartbeatAt:null,retryDeadlineAt:null,errorCode:null};
  const task:AnalysisTask={matchId:sampleHistory[0].id,kind:'analysis',status:'processing',requestedAt:'2026-11-07T10:00:00Z',updatedAt:'2026-11-07T10:01:00Z',progress,queueAhead:null,estimatedParseSeconds:null};
  const old={...sampleHistory[0],analyzed:false,analysisStatus:'failed' as const,analysisUpdatedAt:'2026-11-06T10:00:00Z'};
  expect(projectMatch(old,task).analysisStatus).toBe('processing');const ready={...old,analyzed:true,analysisStatus:'ready' as const,analysisUpdatedAt:'2026-11-07T10:02:00Z'};expect(projectMatch(ready,task)).toBe(ready);
 });
});
describe('first launch assets gate',()=>{
 it('holds login until missing assets finish and reuses verified files',async()=>{mocks.native=true;let finish!:()=>void;mocks.invoke.mockImplementation((command:string)=>command==='asset_status'?Promise.resolve({bytes:20,totalBytes:100,complete:1,total:2}):new Promise<void>(resolve=>{finish=resolve}));render(<AssetGate t={messages.en}><p>Login content</p></AssetGate>);await act(flush);expect(screen.queryByText('Login content')).toBeNull();expect(screen.getByRole('progressbar')).toBeTruthy();await act(async()=>{finish();await flush()});expect(screen.getByText('Login content')).toBeTruthy();expect(mocks.invoke).toHaveBeenCalledWith('prepare_assets')});
 it('opens immediately after validating an existing complete library',async()=>{mocks.native=true;mocks.invoke.mockResolvedValue({bytes:100,totalBytes:100,complete:2,total:2});render(<AssetGate t={messages.en}><p>Workspace</p></AssetGate>);await act(flush);expect(screen.getByText('Workspace')).toBeTruthy();expect(mocks.invoke).not.toHaveBeenCalledWith('prepare_assets')});
});
