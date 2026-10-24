// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import CursorThemeProvider,{useCursorTheme} from "@/components/CursorThemeProvider";
import {CURSOR_EFFECT_STORAGE_KEY} from "@/lib/cursor-theme";
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
function Control(){const {setEffect}=useCursorTheme();return <button onClick={()=>setEffect("none")}>Disable effect</button>;}
describe("cursor work budget",()=>{
 it("does no pointer style updates with no effect",()=>{
  localStorage.setItem(CURSOR_EFFECT_STORAGE_KEY,"none");render(<CursorThemeProvider showSettings={false}><Control/></CursorThemeProvider>);
  const style=vi.spyOn(document.documentElement.style,"setProperty");window.dispatchEvent(new MouseEvent("pointermove",{clientX:20,clientY:40}));expect(style).not.toHaveBeenCalled();
 });
 it("coalesces active pointer movement to one frame and cancels when disabled",()=>{
  localStorage.setItem(CURSOR_EFFECT_STORAGE_KEY,"gold");const frames=new Map<number,FrameRequestCallback>();let count=0;
  vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{frames.set(++count,callback);return count;});vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
  render(<CursorThemeProvider showSettings={false}><Control/></CursorThemeProvider>);
  for(let index=0;index<20;index++)window.dispatchEvent(new MouseEvent("pointermove",{clientX:index,clientY:40}));
  expect(frames.size).toBe(1);fireEvent.click(screen.getByRole("button"));expect(frames.size).toBe(0);
 });
});
