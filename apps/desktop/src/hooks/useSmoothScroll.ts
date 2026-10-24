import {useEffect} from "react";
import {useExperience} from "../experience";
// Native scrolling is the default. Lenis replaces the old wheel interceptor
// only when explicitly enabled. Dialogs and nested scrolling stay native.
export function useSmoothScroll(){
  const settings=useExperience();
  useEffect(()=>{
    const query=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if(!settings.smoothScroll||settings.motion==="reduced"||query?.matches)return;
    let cancelled=false,frame=0,lenis:import("lenis").default|null=null;
    const stop=()=>{cancelAnimationFrame(frame);frame=0;};
    const animate=(time:number)=>{frame=0;if(cancelled||!lenis||document.visibilityState==="hidden")return;lenis.raf(time);if(lenis.isScrolling)frame=requestAnimationFrame(animate);};
    const wake=()=>{if(!frame&&document.visibilityState!=="hidden")frame=requestAnimationFrame(animate);};
    const visibility=()=>{if(document.visibilityState==="hidden"){stop();lenis?.stop();}else lenis?.start();};
    const reduce=()=>{if(query?.matches){stop();lenis?.stop();}else lenis?.start();};
    void import("lenis").then(({default:Lenis})=>{
      if(cancelled)return;
      lenis=new Lenis({autoRaf:false,duration:.45,smoothWheel:true,syncTouch:false,allowNestedScroll:true,
        prevent:node=>!!node.closest('[role="dialog"],[data-native-scroll],input,textarea,select,[contenteditable="true"]')});
      lenis.on("virtual-scroll",wake);lenis.on("scroll",wake);
      window.addEventListener("wheel",wake,{passive:true});document.addEventListener("visibilitychange",visibility);query?.addEventListener("change",reduce);
      visibility();
    });
    return()=>{cancelled=true;stop();lenis?.destroy();window.removeEventListener("wheel",wake);document.removeEventListener("visibilitychange",visibility);query?.removeEventListener("change",reduce);};
  },[settings.smoothScroll,settings.motion]);
}
