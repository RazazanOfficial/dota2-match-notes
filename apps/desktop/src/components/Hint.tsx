import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
export function Hint({ text, children, label, action }: { text: string; children: ReactNode; label: string; action?: ReactNode }) {
    const id = useId();
    const [point, setPoint] = useState<{ x: number; y: number; below: boolean } | null>(null);
    const popup = useRef<HTMLSpanElement>(null), hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trigger = useRef<HTMLElement | null>(null);
    const keep = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
    const hide = () => {
        keep();
        if (action) hideTimer.current = setTimeout(() => setPoint(null), 180);
        else setPoint(null);
    };
    useEffect(() => () => keep(), []);
    useEffect(() => {
        if (!point) return;
        const close = () => setPoint(null);
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (popup.current?.contains(document.activeElement)) trigger.current?.focus();
                close();
            }
        };
        const outside = (event: MouseEvent) => { if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) close(); };
        window.addEventListener("scroll", close, true); window.addEventListener("resize", close); window.addEventListener("keydown", escape);
        window.addEventListener("mousedown", outside);
        return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", escape); window.removeEventListener("mousedown", outside); };
    }, [point]);
    function show(target: HTMLElement) {
        const rect = target.getBoundingClientRect();
        trigger.current = target;
        keep();
        const half = action ? 140 : 112, below = rect.top < (action ? 145 : 75);
        setPoint({ x: Math.min(window.innerWidth - half, Math.max(half, rect.left + rect.width / 2)), y: below ? rect.bottom + 10 : rect.top - 10, below });
    }
    const Trigger = action ? "button" : "span";
    return <Trigger {...(action ? { type: "button" as const } : {})} className={`metric-help ${action ? "metric-help-action" : ""}`} tabIndex={0} aria-label={label}
        aria-describedby={!action && point ? id : undefined} aria-controls={action && point ? id : undefined} aria-expanded={action ? !!point : undefined}
        aria-haspopup={action ? "dialog" : undefined} onMouseEnter={e => show(e.currentTarget)} onMouseLeave={hide} onFocus={e => show(e.currentTarget)}
        onBlur={e => { if (!popup.current?.contains(e.relatedTarget as Node) && !e.currentTarget.contains(e.relatedTarget as Node)) hide(); }}
        onClick={e => { if (action && e.currentTarget.contains(e.target as Node)) show(e.currentTarget); }}
        onKeyDown={e => { if (action && (e.key === "ArrowDown" || (point && e.key === "Tab" && !e.shiftKey)) && e.currentTarget.contains(e.target as Node)) { e.preventDefault(); show(e.currentTarget); requestAnimationFrame(() => popup.current?.querySelector("button")?.focus()); } }}>
        {children}{point && createPortal(<span ref={popup} id={id} className={`metric-tooltip ${action ? "metric-tooltip-action" : ""} ${point.below ? "metric-tooltip-below" : ""}`} role={action ? "dialog" : "tooltip"} aria-label={action ? label : undefined} dir={document.documentElement.dir === "rtl" ? "rtl" : "ltr"} style={{ left: point.x, top: point.y }} onMouseEnter={keep} onMouseLeave={hide} onFocus={keep} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) hide(); }}>{text}{action}</span>, document.body)}
    </Trigger>;
}
