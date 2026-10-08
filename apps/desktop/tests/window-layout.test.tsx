// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { cleanup, fireEvent, render, renderHook, screen, waitFor, act } from "@testing-library/react";
import { chooseWindowPreset, readWindowSpace, resizeWindow, windowPresets, windowPreferenceKey } from "../src/windowLayout";
import { useFixedWindow } from "../src/hooks/useFixedWindow";
import { WindowControls } from "../src/components/WindowControls";
import { MatchLoadout,normalizeBuff } from "../src/components/MatchLoadout";
import { messages } from "../src/i18n";
import { sampleHistory } from "../src/history";
const mocks=vi.hoisted(()=>({current:vi.fn(),primary:vi.fn(),size:vi.fn(),center:vi.fn(),moved:vi.fn(),scale:vi.fn(),inner:vi.fn(),outer:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>true}));
vi.mock("@tauri-apps/api/window",async()=>({...await vi.importActual("@tauri-apps/api/window"),currentMonitor:mocks.current,primaryMonitor:mocks.primary,getCurrentWindow:()=>({setSize:mocks.size,center:mocks.center,onMoved:mocks.moved,onScaleChanged:mocks.scale,innerSize:mocks.inner,outerSize:mocks.outer})}));
const physical=(width:number,height:number)=>({width,height,toLogical:(scale:number)=>({width:width/scale,height:height/scale})});
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();mocks.current.mockResolvedValue({scaleFactor:1,workArea:{size:physical(1920,1040)}});mocks.inner.mockResolvedValue(physical(960,540));mocks.outer.mockResolvedValue(physical(974,572));mocks.size.mockResolvedValue(undefined);mocks.center.mockResolvedValue(undefined);mocks.moved.mockResolvedValue(()=>{});mocks.scale.mockResolvedValue(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("fixed native window layouts",()=>{
 it("chooses a fitting preset, preserves an explicit choice, and never accepts an unknown size",()=>{
  expect(chooseWindowPreset(null,1882,984)?.id).toBe("wide");expect(chooseWindowPreset("medium",1882,984)?.id).toBe("medium");expect(chooseWindowPreset("invalid",1200,670)?.id).toBe("small");expect(chooseWindowPreset("extra",1200,670)?.id).toBe("small");expect(chooseWindowPreset(null,799,449)).toBeNull();
 });
 it("uses work area and display scaling including the real window frame",async()=>{
  mocks.current.mockResolvedValue({scaleFactor:1.5,workArea:{size:physical(1920,1040)}});mocks.inner.mockResolvedValue(physical(1440,810));mocks.outer.mockResolvedValue(physical(1455,855));
  const space=await readWindowSpace();expect(space).toEqual({width:1246,height:639});expect(chooseWindowPreset(null,space.width,space.height)?.id).toBe("compact");await resizeWindow(windowPresets[1]);expect(mocks.size.mock.calls[0][0]).toMatchObject({width:960,height:540,type:"Logical"});expect(mocks.center).toHaveBeenCalled();
 });
 it("restores the chosen size, persists only after successful resize, and rejects unsupported choices",async()=>{
  localStorage.setItem(windowPreferenceKey,"medium");const {result}=renderHook(()=>useFixedWindow());await waitFor(()=>expect(result.current.ready).toBe(true));expect(result.current.selected).toBe("medium");
  await act(()=>result.current.select("standard"));expect(result.current.selected).toBe("standard");expect(localStorage.getItem(windowPreferenceKey)).toBe("standard");
  const count=mocks.size.mock.calls.length;await act(()=>result.current.select("extra"));expect(result.current.failed).toBe(true);expect(mocks.size.mock.calls.length).toBe(count);expect(localStorage.getItem(windowPreferenceKey)).toBe("standard");
 });
 it("finishes native setup in StrictMode without restoring a stale async result",async()=>{
  const {result}=renderHook(()=>useFixedWindow(),{wrapper:StrictMode});await waitFor(()=>expect(result.current.ready).toBe(true));expect(result.current.selected).toBe("wide");expect(result.current.failed).toBe(false);
 });
 it("falls back on a smaller monitor and restores the preferred preset when moved back",async()=>{
  localStorage.setItem(windowPreferenceKey,"wide");const {result}=renderHook(()=>useFixedWindow());await waitFor(()=>expect(result.current.selected).toBe("wide"));
  // The title bar and margins leave only 644px of usable height, below the 648px preset.
  mocks.current.mockResolvedValue({scaleFactor:1,workArea:{size:physical(1200,700)}});act(()=>mocks.moved.mock.calls.at(-1)![0]());await waitFor(()=>expect(result.current.selected).toBe("compact"));expect(localStorage.getItem(windowPreferenceKey)).toBe("wide");
  mocks.current.mockResolvedValue({scaleFactor:1,workArea:{size:physical(1920,1040)}});act(()=>mocks.moved.mock.calls.at(-1)![0]());await waitFor(()=>expect(result.current.selected).toBe("wide"));
 });
 it("renders ratio cards and disables choices that do not fit the current display",()=>{
  const select=vi.fn();render(<WindowControls t={messages.fa} layout={{ready:true,busy:false,native:true,width:1300,height:750,selected:"medium",failed:false,select}}/>);
  expect(screen.getAllByText("16:9")).toHaveLength(8);const extra=screen.getByText("2240 × 1260").closest("button")!;expect(extra.disabled).toBe(true);fireEvent.click(screen.getByText("1280 × 720"));expect(select).toHaveBeenCalledWith("medium");
 });
 it("repairs old cached buff 16 and uses a bundled icon and readable names in both languages",()=>{
  const old={key:"permanent_buff_16",label:"Permanent buff 16",stacks:312};expect(normalizeBuff(old,messages.en)).toMatchObject({key:"life_stealer_feast",label:"Permanent health",stacks:312});expect(normalizeBuff(old,messages.fa).label).toBe("سلامتی دائمی");
  const view=render(<MatchLoadout match={{...sampleHistory[0],buffs:[old]}} t={messages.en}/>);expect(view.container.querySelector('.row-buff img')?.getAttribute('src')).toBe('/buffs/life_stealer_feast.png');expect(view.container.textContent).not.toContain('Permanent buff 16');
  view.rerender(<MatchLoadout match={{...sampleHistory[0],buffs:[{key:"permanent_buff_999",label:"Permanent buff 999",stacks:1}]}} t={messages.fa}/>);expect(view.container.querySelector('.row-buff img')).toBeTruthy();expect(view.container.querySelector('.metric-help')?.getAttribute('aria-label')).toContain(messages.fa.unknownBuff);
 });
});
