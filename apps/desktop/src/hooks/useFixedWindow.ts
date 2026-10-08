import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { readWindowPreference, windowRatios, windowPreferenceKey } from "../windowLayout";

// One IPC at startup/selection; no move/resize listeners or resize feedback loop in React.
export function useWindowAspect() {
    const native=isTauri(), selected=useRef(readWindowPreference());
    const [state,setState]=useState({ready:!native,busy:false,native,selected:selected.current,failed:false});
    const active=useRef(true), running=useRef(false);
    useEffect(()=>{
        active.current=true; let cancelled=false;
        if(native) void invoke("set_window_aspect_ratio",{ratio:selected.current,resize:true})
            .then(()=>{if(!cancelled)setState(s=>({...s,ready:true,failed:false}));})
            .catch(()=>{if(!cancelled)setState(s=>({...s,ready:true,failed:true}));});
        return ()=>{cancelled=true;active.current=false;};
    },[native]);
    async function select(id:string) {
        if(!native || running.current || !windowRatios.some(p=>p.id===id))return;
        running.current=true;setState(s=>({...s,busy:true,failed:false}));
        try {
            await invoke("set_window_aspect_ratio",{ratio:id,resize:true});
            selected.current=id;
            try{localStorage.setItem(windowPreferenceKey,id);}catch{}
            if(active.current)setState(s=>({...s,selected:id,busy:false,failed:false}));
        }catch{if(active.current)setState(s=>({...s,busy:false,failed:true}));}
        finally{running.current=false;}
    }
    return {...state,select};
}
export type WindowAspectState = ReturnType<typeof useWindowAspect>;
