"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CURSOR_EFFECT_STORAGE_KEY,
  CURSOR_PACK_STORAGE_KEY,
  DEFAULT_CURSOR_EFFECT,
  DEFAULT_CURSOR_PACK,
  isCursorEffectId,
  isCursorPackId,
  type CursorEffectId,
  type CursorPackId,
} from "@/lib/cursor-theme";
import CursorSettings from "./CursorSettings";

const TRAIL_PARTICLE_COUNT = 12;
const SPARK_COUNT = 8;

export default function CursorThemeProvider({ children }: { children: ReactNode }) {
  const [pack, setPack] = useState<CursorPackId>(DEFAULT_CURSOR_PACK);
  const [effect, setEffect] = useState<CursorEffectId>(DEFAULT_CURSOR_EFFECT);
  const [ready, setReady] = useState(false);
  const effectRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    try {
      const storedPack = window.localStorage.getItem(CURSOR_PACK_STORAGE_KEY);
      const storedEffect = window.localStorage.getItem(CURSOR_EFFECT_STORAGE_KEY);
      if (isCursorPackId(storedPack)) setPack(storedPack);
      if (isCursorEffectId(storedEffect)) setEffect(storedEffect);
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.cursorPack = pack;
    document.documentElement.dataset.cursorEffect = effect;
    try {
      window.localStorage.setItem(CURSOR_PACK_STORAGE_KEY, pack);
      window.localStorage.setItem(CURSOR_EFFECT_STORAGE_KEY, effect);
    } catch {
      // The visual choice still works for the current page when storage is blocked.
    }
  }, [effect, pack, ready]);

  useEffect(() => {
    let frame = 0;
    const target = { x: -200, y: -200 };
    const trail = Array.from({ length: TRAIL_PARTICLE_COUNT }, () => ({
      x: -200,
      y: -200,
    }));

    const moveAura = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      target.x = event.clientX;
      target.y = event.clientY;
      effectRef.current?.classList.add("is-active");
      document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
    };

    const hideAura = () => effectRef.current?.classList.remove("is-active");

    const animateTrail = () => {
      let leaderX = target.x;
      let leaderY = target.y;
      trail.forEach((point, index) => {
        const follow = Math.max(0.12, 0.34 - index * 0.012);
        point.x += (leaderX - point.x) * follow;
        point.y += (leaderY - point.y) * follow;
        const element = trailRefs.current[index];
        if (element) {
          const scale = Math.max(0.25, 1 - index * 0.058);
          element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) scale(${scale})`;
        }
        leaderX = point.x;
        leaderY = point.y;
      });
      frame = window.requestAnimationFrame(animateTrail);
    };

    window.addEventListener("pointermove", moveAura, { passive: true });
    document.documentElement.addEventListener("mouseleave", hideAura);
    frame = window.requestAnimationFrame(animateTrail);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", moveAura);
      document.documentElement.removeEventListener("mouseleave", hideAura);
    };
  }, []);

  return (
    <>
      {children}
      <div ref={effectRef} className="cursor-fx" aria-hidden="true">
        {Array.from({ length: TRAIL_PARTICLE_COUNT }, (_, index) => (
          <span
            key={`trail-${index}`}
            ref={(node) => {
              trailRefs.current[index] = node;
            }}
            className="cursor-fx-trail"
            style={{ animationDelay: `${index * -0.09}s` }}
          />
        ))}
        <span className="cursor-fx-core">
          {Array.from({ length: SPARK_COUNT }, (_, index) => (
            <i key={`spark-${index}`} style={{ animationDelay: `${index * -0.12}s` }} />
          ))}
        </span>
      </div>
      <CursorSettings
        pack={pack}
        effect={effect}
        onPackChange={setPack}
        onEffectChange={setEffect}
      />
    </>
  );
}
