import { Check } from "lucide-react";
import type { Messages } from "../i18n";
import { windowRatios } from "../windowLayout";
import type { WindowAspectState } from "../hooks/useFixedWindow";
export function WindowControls({layout,t}:{layout:WindowAspectState;t:Messages}) {
    return <section className="panel settings-panel window-settings"><h2>{t.windowSize}</h2><p className="muted">{t.windowSizeDetail}</p><div className="window-size-grid" role="group" aria-label={t.windowSize}>{windowRatios.map(p=><button key={p.id} className="window-size-card" aria-pressed={layout.selected===p.id} disabled={!layout.native || layout.busy} onClick={()=>void layout.select(p.id)}><span className="monitor-preview" style={{aspectRatio:`${p.width} / ${p.height}`}}><bdi>{p.id}</bdi>{layout.selected===p.id && <Check size={14}/>}</span><small>{layout.selected===p.id ? t.windowSelected : t.windowChoose}</small></button>)}</div>{layout.failed && <p role="alert" className="fetch-error">{t.windowSizeFailed}</p>}{!layout.native && <small className="muted">{t.windowDesktopOnly}</small>}</section>;
}
