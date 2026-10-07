import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
export function Hint({ text, children, label }: { text: string; children: ReactNode; label: string }) {
    const id = useId();
    const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
    useEffect(() => {
        if (!point) return;
        const hide = () => setPoint(null);
        window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide);
        return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
    }, [point]);
    function show(target: HTMLElement) {
        const rect = target.getBoundingClientRect();
        setPoint({ x: Math.min(window.innerWidth - 112, Math.max(112, rect.left + rect.width / 2)), y: rect.top - 10 });
    }
    return <span className="metric-help" tabIndex={0} aria-label={label} aria-describedby={point ? id : undefined} onMouseEnter={e => show(e.currentTarget)} onMouseLeave={() => setPoint(null)} onFocus={e => show(e.currentTarget)} onBlur={() => setPoint(null)}>
        {children}{point && createPortal(<span id={id} className="metric-tooltip" role="tooltip" style={{ left: point.x, top: point.y }}>{text}</span>, document.body)}
    </span>;
}
