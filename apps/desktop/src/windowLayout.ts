import { currentMonitor, primaryMonitor, getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
export const windowPresets = [
    {id:"mini",width:800,height:450,ratio:"16:9"},
    {id:"compact",width:960,height:540,ratio:"16:9"},
    {id:"small",width:1152,height:648,ratio:"16:9"},
    {id:"medium",width:1280,height:720,ratio:"16:9"},
    {id:"standard",width:1440,height:810,ratio:"16:9"},
    {id:"large",width:1600,height:900,ratio:"16:9"},
    {id:"wide",width:1728,height:972,ratio:"16:9"},
    {id:"ultrawide",width:1680,height:720,ratio:"21:9"},
    {id:"extra",width:2240,height:1260,ratio:"16:9"},
] as const;
export type WindowPreset = typeof windowPresets[number];
export const windowPreferenceKey = "dota-notes.window-size.v1";
export function readWindowPreference(): string | null {
    try { const id=localStorage.getItem(windowPreferenceKey); return windowPresets.some(p=>p.id===id) ? id : null; } catch { return null; }
}
export function chooseWindowPreset(preferred:string|null,width:number,height:number):WindowPreset|null {
    const supported=windowPresets.filter(p=>p.width<=width && p.height<=height);
    return supported.find(p=>p.id===preferred) || supported.filter(p=>p.ratio==="16:9").at(-1) || supported.at(-1) || null;
}
export async function readWindowSpace() {
    const monitor=await currentMonitor() || await primaryMonitor();
    if (!monitor) throw new Error("Monitor unavailable");
    const win=getCurrentWindow(), [inner,outer]=await Promise.all([win.innerSize(),win.outerSize()]);
    const scale=monitor.scaleFactor;
    const area=(monitor.workArea?.size || monitor.size).toLogical(scale);
    // Reserve twelve logical pixels on each side, plus the real OS frame/title bar.
    return {width:Math.floor(area.width-Math.max(0,outer.width-inner.width)/scale-24),height:Math.floor(area.height-Math.max(0,outer.height-inner.height)/scale-24)};
}
export async function resizeWindow(preset:WindowPreset,center=true) {
    const win=getCurrentWindow();
    await win.setSize(new LogicalSize(preset.width,preset.height));
    if(center) await win.center();
}
