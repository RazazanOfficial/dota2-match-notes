import {useEffect, useSyncExternalStore} from "react";
export type MotionMode = "balanced" | "full" | "reduced";
export interface Experience {motion:MotionMode; smoothScroll:boolean; sound:boolean}
const key="dota-notes.experience.v1", defaults:Experience={motion:"balanced",smoothScroll:false,sound:false};
export function readExperience():Experience {
  try {const value=JSON.parse(localStorage.getItem(key)||"null");return {motion:["balanced","full","reduced"].includes(value?.motion)?value.motion:"balanced",smoothScroll:value?.smoothScroll===true,sound:value?.sound===true};}
  catch{return {...defaults};}
}
let state=readExperience();const listeners=new Set<()=>void>();
export const experienceSnapshot=()=>state;
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function setExperience(next:Partial<Experience>){state={...state,...next};try{localStorage.setItem(key,JSON.stringify(state));}catch{}listeners.forEach(listener=>listener());}
export function useExperience(){return useSyncExternalStore(subscribe,experienceSnapshot,experienceSnapshot);}
export function motionAllowed(){return state.motion!=="reduced"&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;}
export function useExperienceRoot(){
  const settings=useExperience();
  useEffect(()=>{const root=document.documentElement;root.dataset.motion=settings.motion;const visibility=()=>{root.dataset.windowHidden=String(document.visibilityState==="hidden");};visibility();document.addEventListener("visibilitychange",visibility);return()=>{delete root.dataset.motion;delete root.dataset.windowHidden;document.removeEventListener("visibilitychange",visibility);};},[settings.motion]);
}
export function deferWork(work:()=>void){
  if(typeof window.requestIdleCallback==="function") {const id=window.requestIdleCallback(work,{timeout:500});return()=>window.cancelIdleCallback(id);}
  const id=window.setTimeout(work,40);return()=>window.clearTimeout(id);
}
let audio:AudioContext|null=null,lastSound=0;
export function playUISound(kind:"open"|"close"|"complete"|"error"){
  if(!state.sound||document.visibilityState==="hidden"||Date.now()-lastSound<180)return;
  try {
    if(!audio)audio=new AudioContext();
    if(audio.state==="suspended") {if(!navigator.userActivation?.isActive)return;void audio.resume();}
    lastSound=Date.now();const now=audio.currentTime,oscillator=audio.createOscillator(),gain=audio.createGain();
    oscillator.type="sine";const frequency=kind==="complete"?740:kind==="open"?460:kind==="close"?360:230;
    oscillator.frequency.setValueAtTime(frequency,now);oscillator.frequency.exponentialRampToValueAtTime(frequency*(kind==="close"?.8:1.2),now+.1);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.025,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.12);
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now);oscillator.stop(now+.13);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  } catch {/* Unsupported audio must never affect a task. */}
}
