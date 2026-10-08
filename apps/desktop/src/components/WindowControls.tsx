import { Check } from "lucide-react";
import type { Messages } from "../i18n";
import { windowPresets } from "../windowLayout";
import type { WindowLayoutState } from "../hooks/useFixedWindow";
export function WindowControls({layout,t}:{layout:WindowLayoutState;t:Messages}) {
    return <section className="panel settings-panel window-settings"><h2>{t.windowSize}</h2><p className="muted">{t.windowSizeDetail}</p><div className="window-size-grid" role="group" aria-label={t.windowSize}>{windowPresets.map(p=>{
        const supported=layout.native && p.width<=layout.width && p.height<=layout.height;
        return <button key={p.id} className="window-size-card" aria-pressed={layout.selected===p.id} disabled={!supported || layout.busy} onClick={()=>void layout.select(p.id)}><span className="monitor-preview" style={{aspectRatio:`${p.width} / ${p.height}`}}><bdi>{p.ratio}</bdi>{layout.selected===p.id && <Check size={14}/>}</span><bdi>{p.width} × {p.height}</bdi><small>{layout.selected===p.id ? t.windowSelected : supported ? t.windowChoose : t.windowUnavailable}</small></button>;
    })}</div>{layout.failed && <p role="alert" className="fetch-error">{t.windowSizeFailed}</p>}{!layout.native && <small className="muted">{t.windowDesktopOnly}</small>}</section>;
}
