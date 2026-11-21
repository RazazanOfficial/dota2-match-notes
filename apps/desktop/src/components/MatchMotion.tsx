import { useEffect, useRef, type ReactNode } from "react";
import type { gsap as GSAP } from "gsap";
import { motionAllowed, useExperience } from "../experience";

/** Finite, scoped entrances. Content remains readable before GSAP loads. */
export function MatchMotion({ children, identity, className = "" }: { children: ReactNode; identity: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const { motion } = useExperience();
  useEffect(() => {
    const element = root.current;
    if (!element || !motionAllowed() || document.visibilityState === "hidden") return;
    let disposed = false;
    let context: ReturnType<typeof GSAP.context> | undefined;
    const started = performance.now();
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const stop = () => context?.revert();
    const visibility = () => { if (document.visibilityState === "hidden") stop(); };
    media?.addEventListener?.("change", stop);
    document.addEventListener("visibilitychange", visibility);
    void import("gsap").then(({ gsap }) => {
      if (disposed || !motionAllowed() || document.visibilityState === "hidden" || performance.now() - started > 250) return;
      context = gsap.context(() => {
        const targets = element.querySelectorAll("[data-reveal]");
        gsap.fromTo(targets.length ? targets : [element], { opacity: .55, y: motion === "full" ? 14 : 7 }, {
          opacity: 1, y: 0, duration: .34, stagger: { each: .035, amount: .22 }, ease: "power2.out", clearProps: "opacity,transform",
        });
      }, element);
    }).catch(() => { /* Motion never blocks the match. */ });
    return () => { disposed = true; stop(); media?.removeEventListener?.("change", stop); document.removeEventListener("visibilitychange", visibility); };
  }, [identity, motion]);
  return <div ref={root} className={className}>{children}</div>;
}
