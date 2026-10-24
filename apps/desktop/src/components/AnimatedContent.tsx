// Adapted from React Bits AnimatedContent, David Haz (2026).
// License and source: docs/third-party/react-bits-LICENSE.md.
// Mount-only variant: deferred GSAP, no ScrollTrigger or permanent RAF loop.
import {useEffect,useRef,type ReactNode} from "react";
import type {gsap} from "gsap";
import {motionAllowed,useExperience} from "../experience";
export function AnimatedContent({children,className="",identity}:{children:ReactNode;className?:string;identity?:string}){
  const root=useRef<HTMLDivElement>(null),settings=useExperience();
  useEffect(()=>{
    if(!root.current||!motionAllowed()||document.visibilityState==="hidden")return;
    let cancelled=false,context:gsap.Context|undefined;const started=performance.now();
    void import("gsap").then(({gsap})=>{
      // A late animation must never hide content that has already been read.
      if(cancelled||!root.current||!motionAllowed()||document.visibilityState==="hidden"||performance.now()-started>180)return;
      context=gsap.context(()=>{gsap.fromTo(root.current,{opacity:.35,y:settings.motion==="full"?10:5},{opacity:1,y:0,duration:.24,ease:"power2.out",clearProps:"transform,opacity"});},root);
    }).catch(()=>{/* Transitions are optional; content is already visible. */});
    return()=>{cancelled=true;context?.revert();};
  },[identity,settings.motion]);
  return <div ref={root} className={className}>{children}</div>;
}
