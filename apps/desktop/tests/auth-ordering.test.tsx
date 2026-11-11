// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),api:vi.fn(),session:vi.fn(),logout:vi.fn(),open:undefined as undefined|((urls:string[])=>void)}));
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>true,invoke:mocks.invoke}));
vi.mock('@tauri-apps/plugin-deep-link',()=>({onOpenUrl:async(fn:(urls:string[])=>void)=>{mocks.open=fn;return()=>{};},getCurrent:async()=>null}));
vi.mock('../src/api',async()=>({...await vi.importActual('../src/api'),apiRequest:mocks.api,currentSession:mocks.session,logout:mocks.logout}));
import {useDesktopAuth} from '../src/desktopAuth';
import {getBearer,setBearer} from '../src/api';
import {clearOfflineAccount} from '../src/offlineCache';
const user={mode:'player' as const,username:'password_user',steamId:'76561197960265828',steamAccountId:100};
const pendingKey='dota-notes.desktop-login.pending';
function steamCallback(){const pending=JSON.parse(sessionStorage.getItem(pendingKey)!);return `dota-notes://auth/callback?code=${'c'.repeat(43)}&nonce=${pending.nonce}`;}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();setBearer(null);clearOfflineAccount();vi.stubGlobal('crypto',webcrypto);mocks.invoke.mockResolvedValue(null);mocks.session.mockResolvedValue(user);mocks.api.mockResolvedValue({token:'password-token'});mocks.logout.mockResolvedValue(undefined);});
afterEach(()=>{cleanup();setBearer(null);clearOfflineAccount();vi.unstubAllGlobals();});
async function start(){const hook=renderHook(()=>useDesktopAuth());await waitFor(()=>expect(hook.result.current.restoring).toBe(false));return hook;}
describe('native authentication ordering',()=>{
 it('ignores a user lookup completing after logout',async()=>{
  const {result}=await start();let finish!:(value:typeof user)=>void;mocks.session.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  let login!:Promise<void>;act(()=>{login=result.current.signInWithPassword('100','password');});
  await waitFor(()=>expect(mocks.session).toHaveBeenCalledOnce());await act(()=>result.current.signOut());
  await act(async()=>{finish(user);await login;});expect(result.current.session).toBeNull();expect(getBearer()).toBeNull();
  expect(mocks.invoke).not.toHaveBeenCalledWith('save_session_token',{token:'password-token'});
 });
 it('clears the vault after an already-running save completes during logout',async()=>{
  const {result}=await start();let finish!:()=>void;
  mocks.invoke.mockImplementation((name:string)=>name==='save_session_token'?new Promise<void>(resolve=>{finish=resolve;}):Promise.resolve(null));
  let login!:Promise<void>,logout!:Promise<void>;act(()=>{login=result.current.signInWithPassword('100','password');});
  await waitFor(()=>expect(mocks.invoke).toHaveBeenCalledWith('save_session_token',{token:'password-token'}));
  act(()=>{logout=result.current.signOut();});await act(async()=>{finish();await Promise.all([login,logout]);});
  expect(result.current.session).toBeNull();expect(mocks.invoke.mock.calls.at(-1)?.[0]).toBe('clear_session_token');
 });
 it('does not restore a session refresh completing after logout',async()=>{
  const {result}=await start();let finish!:(value:typeof user)=>void;
  mocks.session.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));let refresh!:Promise<void>;
  act(()=>{refresh=result.current.refreshSession();});await act(()=>result.current.signOut());
  await act(async()=>{finish(user);await refresh;});expect(result.current.session).toBeNull();expect(getBearer()).toBeNull();
 });
 it('invalidates a pending Steam callback when password login succeeds',async()=>{
  const {result}=await start();await act(()=>result.current.signIn());const callback=steamCallback();
  await act(()=>result.current.signInWithPassword('100','password'));
  await act(async()=>mocks.open!([callback]));
  expect(result.current.session).toEqual(user);expect(getBearer()).toBe('password-token');
  expect(mocks.api).toHaveBeenCalledTimes(1);expect(sessionStorage.getItem(pendingKey)).toBeNull();
 });
 it('ignores a Steam exchange finishing after a newer password login',async()=>{
  const {result}=await start();await act(()=>result.current.signIn());const callback=steamCallback();
  let finish!:(value:{token:string})=>void;
  mocks.api.mockImplementation((path:string)=>path.includes('exchange')?new Promise(resolve=>{finish=resolve;}):Promise.resolve({token:'password-token'}));
  act(()=>mocks.open!([callback]));await act(()=>result.current.signInWithPassword('100','password'));
  await act(async()=>{finish({token:'old-steam-token'});});
  expect(result.current.session).toEqual(user);expect(getBearer()).toBe('password-token');
  expect(mocks.invoke).not.toHaveBeenCalledWith('save_session_token',{token:'old-steam-token'});
 });
 it('does not accept a pending or in-flight Steam callback after logout',async()=>{
  const {result}=await start();await act(()=>result.current.signIn());const callback=steamCallback();
  let finish!:(value:{token:string})=>void;mocks.api.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  act(()=>mocks.open!([callback]));await act(()=>result.current.signOut());
  await act(async()=>{finish({token:'late-steam-token'});mocks.open!([callback]);});
  expect(result.current.session).toBeNull();expect(getBearer()).toBeNull();
  expect(mocks.invoke).not.toHaveBeenCalledWith('save_session_token',{token:'late-steam-token'});
 });
 it('does not restore an in-flight password login after logout',async()=>{
  const {result}=await start();let finish!:(value:{token:string})=>void;
  mocks.api.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));let login!:Promise<void>;
  act(()=>{login=result.current.signInWithPassword('100','password');});await act(()=>result.current.signOut());
  await act(async()=>{finish({token:'late-password-token'});await login;});
  expect(result.current.session).toBeNull();expect(getBearer()).toBeNull();
  expect(mocks.invoke).not.toHaveBeenCalledWith('save_session_token',{token:'late-password-token'});
 });
});
