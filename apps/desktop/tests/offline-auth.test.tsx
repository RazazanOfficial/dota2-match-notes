// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {webcrypto} from "node:crypto";
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {useDesktopAuth} from "../src/desktopAuth";
import {ApiError,setBearer} from "../src/api";
import {clearOfflineAccount,saveOfflineSession,restoreOfflineSession} from "../src/offlineCache";
import {setConnection} from "../src/connection";
const mocks=vi.hoisted(()=>({invoke:vi.fn(),session:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>true,invoke:mocks.invoke}));
vi.mock("@tauri-apps/plugin-deep-link",()=>({onOpenUrl:async()=>()=>{},getCurrent:async()=>null}));
vi.mock("../src/api",async()=>({...await vi.importActual("../src/api"),currentSession:mocks.session}));
const user={mode:"player" as const,username:"steam_100",steamId:"76561197960265828",steamAccountId:100,onboardingCompletedAt:"2026-10-01T00:00:00Z"};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();clearOfflineAccount();setBearer(null);setConnection("online");vi.stubGlobal("crypto",webcrypto);mocks.invoke.mockImplementation(async(name:string)=>name==="load_session_token"?"native-token":undefined);});
afterEach(()=>{cleanup();clearOfflineAccount();setBearer(null);vi.unstubAllGlobals();});
describe("native offline session restoration",()=>{
 it("shows the saved workspace before background validation and retains it on an outage",async()=>{
  await saveOfflineSession("native-token",user);let reject!:(reason:unknown)=>void;mocks.session.mockImplementation(()=>new Promise((_,r)=>reject=r));
  const {result}=renderHook(()=>useDesktopAuth());await waitFor(()=>expect(result.current.session).toEqual(user));expect(result.current.restoring).toBe(false);
  await act(async()=>reject(new ApiError("offline",0,"offline_mode")));expect(result.current.session).toEqual(user);expect(result.current.error).toBe("");
 });
 it("revokes cached identity on a definitive 401",async()=>{
  await saveOfflineSession("native-token",user);mocks.session.mockRejectedValue(new ApiError("expired",401));
  const {result}=renderHook(()=>useDesktopAuth());await waitFor(()=>expect(result.current.restoring).toBe(false));expect(result.current.session).toBeNull();expect(await restoreOfflineSession("native-token")).toBeNull();expect(mocks.invoke).toHaveBeenCalledWith("clear_session_token");
 });
 it("preserves incomplete onboarding instead of turning it into a completed account",async()=>{
  await saveOfflineSession("native-token",{...user,onboardingCompletedAt:null});mocks.session.mockRejectedValue(new ApiError("offline",0,"offline_mode"));
  const {result}=renderHook(()=>useDesktopAuth());await waitFor(()=>expect(result.current.session?.steamId).toBe(user.steamId));expect(result.current.session?.onboardingCompletedAt).toBeNull();
 });
 it("clears the native token and cache even when logging out offline",async()=>{
  await saveOfflineSession("native-token",user);mocks.session.mockRejectedValue(new ApiError("offline",0,"offline_mode"));setConnection("offline");
  const {result}=renderHook(()=>useDesktopAuth());await waitFor(()=>expect(result.current.restoring).toBe(false));await act(()=>result.current.signOut());
  expect(result.current.session).toBeNull();expect(result.current.error).toBe("");expect(await restoreOfflineSession("native-token")).toBeNull();expect(mocks.invoke).toHaveBeenCalledWith("clear_session_token");
 });
});
