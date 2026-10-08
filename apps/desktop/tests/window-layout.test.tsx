// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { cleanup, fireEvent, render, renderHook, screen, waitFor, act } from "@testing-library/react";
import { readWindowPreference, windowPreferenceKey } from "../src/windowLayout";
import { useWindowAspect } from "../src/hooks/useFixedWindow";
import { WindowControls } from "../src/components/WindowControls";
import { MatchLoadout,normalizeBuff } from "../src/components/MatchLoadout";
import { messages } from "../src/i18n";
import { sampleHistory } from "../src/history";
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>true,invoke:mocks.invoke}));
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();mocks.invoke.mockResolvedValue(undefined);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("native window aspect ratios",()=>{
 it("ignores old resolution presets and rejects an invalid persisted ratio",()=>{
  localStorage.setItem("dota-notes.window-size.v1","wide");expect(readWindowPreference()).toBe("16:9");
  localStorage.setItem(windowPreferenceKey,"1920x1080");expect(readWindowPreference()).toBe("16:9");
  localStorage.setItem(windowPreferenceKey,"4:3");expect(readWindowPreference()).toBe("4:3");
 });
 it("restores the saved ratio through one native command",async()=>{
  localStorage.setItem(windowPreferenceKey,"16:10");const {result}=renderHook(()=>useWindowAspect());await waitFor(()=>expect(result.current.ready).toBe(true));
  expect(mocks.invoke).toHaveBeenCalledTimes(1);expect(mocks.invoke).toHaveBeenCalledWith("set_window_aspect_ratio",{ratio:"16:10",resize:true});
 });
 it("persists only a successful ratio change and rejects unsupported values",async()=>{
  const {result}=renderHook(()=>useWindowAspect());await waitFor(()=>expect(result.current.ready).toBe(true));
  await act(()=>result.current.select("21:9"));expect(localStorage.getItem(windowPreferenceKey)).toBe("21:9");
  const count=mocks.invoke.mock.calls.length;await act(()=>result.current.select("extra"));expect(mocks.invoke).toHaveBeenCalledTimes(count);
  mocks.invoke.mockRejectedValueOnce(new Error("IPC failed"));await act(()=>result.current.select("4:3"));expect(result.current.failed).toBe(true);expect(result.current.selected).toBe("21:9");expect(localStorage.getItem(windowPreferenceKey)).toBe("21:9");
 });
 it("finishes startup in StrictMode and does not block the app on a native failure",async()=>{
  const {result}=renderHook(()=>useWindowAspect(),{wrapper:StrictMode});await waitFor(()=>expect(result.current.ready).toBe(true));expect(result.current.failed).toBe(false);
 });
 it("lets the app finish loading when the native command is unavailable",async()=>{
  mocks.invoke.mockRejectedValueOnce(new Error("not allowed"));const {result}=renderHook(()=>useWindowAspect());await waitFor(()=>expect(result.current.ready).toBe(true));expect(result.current.failed).toBe(true);
 });
 it("renders ratio cards without fixed resolutions or a fullscreen option",()=>{
  const select=vi.fn();const view=render(<WindowControls t={messages.fa} layout={{ready:true,busy:false,native:true,selected:"16:9",failed:false,select}}/>);
  expect(screen.getAllByRole("button")).toHaveLength(5);expect(view.container.textContent).not.toMatch(/1920|1480|Full.?screen|تمام.?صفحه/);fireEvent.click(screen.getByText("4:3"));expect(select).toHaveBeenCalledWith("4:3");
 });
 it("repairs old cached buff 16 and uses a bundled icon and readable names in both languages",()=>{
  const old={key:"permanent_buff_16",label:"Permanent buff 16",stacks:312};expect(normalizeBuff(old,messages.en)).toMatchObject({key:"life_stealer_feast",label:"Permanent health",stacks:312});expect(normalizeBuff(old,messages.fa).label).toBe("سلامتی دائمی");
  const view=render(<MatchLoadout match={{...sampleHistory[0],buffs:[old]}} t={messages.en}/>);expect(view.container.querySelector('.row-buff img')?.getAttribute('src')).toBe('/buffs/life_stealer_feast.png');expect(view.container.textContent).not.toContain('Permanent buff 16');
  view.rerender(<MatchLoadout match={{...sampleHistory[0],buffs:[{key:"permanent_buff_999",label:"Permanent buff 999",stacks:1}]}} t={messages.fa}/>);expect(view.container.querySelector('.row-buff img')).toBeTruthy();expect(view.container.querySelector('.metric-help')?.getAttribute('aria-label')).toContain(messages.fa.unknownBuff);
 });
});
