import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { chooseWindowPreset, readWindowPreference, readWindowSpace, resizeWindow, windowPreferenceKey } from "../windowLayout";
export function useFixedWindow() {
    const native=isTauri(), requested=useRef(readWindowPreference());
    const [state,setState]=useState({ready:!native,busy:false,native,width:0,height:0,selected:"",failed:false});
    const active=useRef(true), running=useRef(false), applied=useRef(""), revision=useRef(0);
    useEffect(()=>{
        active.current=true; const generation=++revision.current; const alive=()=>active.current && generation===revision.current; if(!native)return;
        let timer=0; const stops:Array<()=>void>=[];
        const refresh=async(center=false)=>{
            if(running.current)return; running.current=true;
            try {
                const space=await readWindowSpace(), preset=chooseWindowPreset(requested.current,space.width,space.height);
                if(!alive())return;
                if(!preset)throw new Error("No fitting preset");
                if(preset.id!==applied.current){await resizeWindow(preset,center || !!applied.current);if(!alive())return;applied.current=preset.id;}
                if(alive())setState({ready:true,busy:false,native,...space,selected:preset.id,failed:false});
            } catch {if(alive())setState(s=>({...s,ready:true,busy:false,failed:true}));}
            finally {if(alive())running.current=false;}
        };
        void refresh(true);
        const changed=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>void refresh(),300);};
        const win=getCurrentWindow();
        for(const listen of [()=>win.onMoved(changed),()=>win.onScaleChanged(changed)]) void listen().then(stop=>{if(alive())stops.push(stop);else stop();}).catch(()=>{});
        return ()=>{active.current=false;revision.current++;running.current=false;window.clearTimeout(timer);for(const stop of stops)stop();};
    },[native]);
    async function select(id:string) {
        if(!native || running.current)return;
        running.current=true;setState(s=>({...s,busy:true,failed:false}));
        try {
            const space=await readWindowSpace(), preset=chooseWindowPreset(id,space.width,space.height);
            if(!preset || preset.id!==id)throw new Error("Preset does not fit");
            await resizeWindow(preset);applied.current=id;requested.current=id;
            try{localStorage.setItem(windowPreferenceKey,id);}catch{}
            if(active.current)setState({ready:true,busy:false,native,...space,selected:id,failed:false});
        }catch{if(active.current)setState(s=>({...s,busy:false,failed:true}));}
        finally{running.current=false;}
    }
    return {...state,select};
}
export type WindowLayoutState = ReturnType<typeof useFixedWindow>;
