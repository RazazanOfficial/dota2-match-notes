// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,renderHook} from "@testing-library/react";
import {useSmoothScroll} from "../src/hooks/useSmoothScroll";
import {setExperience} from "../src/experience";
const mock=vi.hoisted(()=>({instances:[] as any[]}));
vi.mock("lenis",()=>({default:class {
  isScrolling=false;on=vi.fn();raf=vi.fn();stop=vi.fn();start=vi.fn();destroy=vi.fn();
  constructor(public options:unknown){mock.instances.push(this);}
}}));
afterEach(()=>{cleanup();setExperience({smoothScroll:false,motion:"balanced"});mock.instances=[];vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(reduced=false){
  vi.stubGlobal("matchMedia",()=>({matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  const frames=new Map<number,FrameRequestCallback>();let next=0;
  vi.stubGlobal("requestAnimationFrame",(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next;});
  vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
  return frames;
}
describe("optional workspace scrolling",()=>{
  it("uses native scrolling by default without loading an animation loop",()=>{
    const frames=setup();setExperience({smoothScroll:false});renderHook(()=>useSmoothScroll());
    const event=new WheelEvent("wheel",{deltaY:120,cancelable:true,bubbles:true});document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);expect(frames.size).toBe(0);expect(mock.instances).toHaveLength(0);
  });
  it("creates Lenis only on request, stops RAF at idle and destroys it on navigation",async()=>{
    const frames=setup();setExperience({smoothScroll:true,motion:"balanced"});const hook=renderHook(()=>useSmoothScroll());await act(async()=>{});
    const lenis=mock.instances[0];expect(lenis.options.autoRaf).toBe(false);expect(frames.size).toBe(0);
    window.dispatchEvent(new WheelEvent("wheel"));expect(frames.size).toBe(1);
    const [id,callback]=[...frames][0];frames.delete(id);callback(16);expect(lenis.raf).toHaveBeenCalledWith(16);expect(frames.size).toBe(0);
    const dialog=document.createElement("div");dialog.setAttribute("role","dialog");const child=document.createElement("span");dialog.appendChild(child);expect(lenis.options.prevent(child)).toBe(true);
    hook.unmount();expect(lenis.destroy).toHaveBeenCalledOnce();
  });
  it("honors the system reduced-motion preference even if smooth scrolling is enabled",async()=>{
    const frames=setup(true);setExperience({smoothScroll:true});renderHook(()=>useSmoothScroll());await act(async()=>{});expect(mock.instances).toHaveLength(0);expect(frames.size).toBe(0);
  });
});
