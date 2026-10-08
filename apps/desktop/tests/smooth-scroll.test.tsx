// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,renderHook} from "@testing-library/react";
import {useSmoothScroll} from "../src/hooks/useSmoothScroll";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(reduced=false) {
    vi.stubGlobal("matchMedia",()=>({matches:reduced}));
    vi.spyOn(document.documentElement,"scrollHeight","get").mockReturnValue(4000);
    vi.stubGlobal("innerHeight",1000);vi.stubGlobal("scrollY",0);
    const frames=new Map<number,FrameRequestCallback>();let next=0;
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next;});
    vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
    const scroll=vi.fn((options:ScrollToOptions)=>vi.stubGlobal("scrollY",options.top || 0));vi.stubGlobal("scrollTo",scroll);
    renderHook(()=>useSmoothScroll());return{frames,scroll};
}
describe("workspace wheel scrolling",()=>{
    it("combines wheel movement into one animation, reaches its target and cancels on navigation keys",()=>{
        const {frames,scroll}=setup();const send=()=>{const event=new WheelEvent("wheel",{deltaY:120,cancelable:true,bubbles:true});document.body.dispatchEvent(event);return event;};
        expect(send().defaultPrevented).toBe(true);send();expect(frames.size).toBe(1);
        let time=performance.now();for(let n=0;n<60 && frames.size;n++){const [id,callback]=[...frames][0];frames.delete(id);callback(time+=16);}
        expect(window.scrollY).toBe(240);expect(scroll).toHaveBeenCalled();expect(frames.size).toBe(0);
        send();window.dispatchEvent(new KeyboardEvent("keydown",{key:"PageDown"}));expect(frames.size).toBe(0);
    });
    it("leaves reduced motion, zoom and dialog scrolling native",()=>{
        const reduced=setup(true);const first=new WheelEvent("wheel",{deltaY:120,cancelable:true,bubbles:true});document.body.dispatchEvent(first);expect(first.defaultPrevented).toBe(false);expect(reduced.frames.size).toBe(0);cleanup();
        const normal=setup();const zoom=new WheelEvent("wheel",{deltaY:120,ctrlKey:true,cancelable:true,bubbles:true});document.body.dispatchEvent(zoom);expect(zoom.defaultPrevented).toBe(false);
        const dialog=document.createElement("div");dialog.setAttribute("role","dialog");document.body.appendChild(dialog);const wheel=new WheelEvent("wheel",{deltaY:120,cancelable:true,bubbles:true});dialog.dispatchEvent(wheel);expect(wheel.defaultPrevented).toBe(false);expect(normal.frames.size).toBe(0);dialog.remove();
    });
});
