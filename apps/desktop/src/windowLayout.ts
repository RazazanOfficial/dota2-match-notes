export const windowRatios = [
    {id:"16:9",width:16,height:9}, {id:"16:10",width:16,height:10},
    {id:"21:9",width:21,height:9}, {id:"4:3",width:4,height:3},
    {id:"3:2",width:3,height:2},
] as const;
export const windowPreferenceKey = "dota-notes.window-aspect.v1";
export function readWindowPreference(): string {
    try { const id=localStorage.getItem(windowPreferenceKey); return windowRatios.some(p=>p.id===id) ? id! : "16:9"; }
    catch { return "16:9"; }
}
