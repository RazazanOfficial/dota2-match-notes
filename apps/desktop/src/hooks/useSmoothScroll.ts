import { useEffect } from "react";

// Smooth the outer workspace only; dialogs, editable controls, nested scroll
// containers, touch gestures and browser zoom keep their native behavior.
export function useSmoothScroll() {
    useEffect(() => {
        let frame = 0, target = 0, previousTime = 0;
        const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
        const animate = (time: number) => {
            const step = Math.min(40, Math.max(1, time - previousTime)); previousTime = time;
            const top = window.scrollY + (target - window.scrollY) * (1 - Math.exp(-step / 65));
            if (Math.abs(target - top) < .8) { window.scrollTo({ top: target, behavior: "instant" }); frame = 0; return; }
            window.scrollTo({ top, behavior: "instant" }); frame = requestAnimationFrame(animate);
        };
        const wheel = (event: WheelEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
            if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { stop(); return; }
            let element = event.target instanceof Element ? event.target : null;
            if (element?.closest('[role="dialog"],input,textarea,select,[contenteditable="true"]')) return;
            while (element && element !== document.documentElement && element !== document.body) {
                if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) return;
                element = element.parentElement;
            }
            const max = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
            if (max <= 0 || !event.deltaY) return;
            const delta = event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1);
            const next = Math.max(0, Math.min(max, (frame ? target : window.scrollY) + delta));
            if (next === window.scrollY && !frame) return;
            event.preventDefault(); target = next;
            if (!frame) { previousTime = performance.now(); frame = requestAnimationFrame(animate); }
        };
        const keyboard = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"].includes(event.key)) stop(); };
        window.addEventListener("wheel", wheel, { passive: false });
        window.addEventListener("pointerdown", stop); window.addEventListener("keydown", keyboard);
        return () => { stop(); window.removeEventListener("wheel", wheel); window.removeEventListener("pointerdown", stop); window.removeEventListener("keydown", keyboard); };
    }, []);
}
