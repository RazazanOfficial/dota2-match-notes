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

const SPARK_COUNT = 12;

export default function CursorThemeProvider({ children }: { children: ReactNode }) {
  const [pack, setPack] = useState<CursorPackId>(DEFAULT_CURSOR_PACK);
  const [effect, setEffect] = useState<CursorEffectId>(DEFAULT_CURSOR_EFFECT);
  const [ready, setReady] = useState(false);
  const effectRef = useRef<HTMLDivElement>(null);

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
    const hideAura = () => {
      effectRef.current?.classList.remove("is-active");
    };

    const moveAura = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
      const isOverPageContent =
        event.clientX >= 0 &&
        event.clientY >= 0 &&
        event.clientX < document.documentElement.clientWidth &&
        event.clientY < document.documentElement.clientHeight;

      if (event.buttons === 0 && isOverPageContent) {
        effectRef.current?.classList.add("is-active");
      } else {
        hideAura();
      }
    };

    const hideWhenPageIsBackgrounded = () => {
      if (document.visibilityState !== "visible") hideAura();
    };

    window.addEventListener("pointermove", moveAura, { passive: true });
    window.addEventListener("pointerdown", hideAura, { capture: true, passive: true });
    window.addEventListener("pointercancel", hideAura, { passive: true });
    window.addEventListener("wheel", hideAura, { capture: true, passive: true });
    window.addEventListener("scroll", hideAura, { capture: true, passive: true });
    window.addEventListener("blur", hideAura);
    document.documentElement.addEventListener("mouseleave", hideAura);
    document.addEventListener("visibilitychange", hideWhenPageIsBackgrounded);
    return () => {
      window.removeEventListener("pointermove", moveAura);
      window.removeEventListener("pointerdown", hideAura, true);
      window.removeEventListener("pointercancel", hideAura);
      window.removeEventListener("wheel", hideAura, true);
      window.removeEventListener("scroll", hideAura, true);
      window.removeEventListener("blur", hideAura);
      document.documentElement.removeEventListener("mouseleave", hideAura);
      document.removeEventListener("visibilitychange", hideWhenPageIsBackgrounded);
    };
  }, []);

  return (
    <>
      {children}
      <div ref={effectRef} className="cursor-fx" aria-hidden="true">
        <span className="cursor-fx-core">
          {Array.from({ length: SPARK_COUNT }, (_, index) => (
            <i key={`spark-${index}`} style={{ animationDelay: `${index * -0.12}s` }} />
          ))}
        </span>
        <span className="cursor-fx-plume">
          {Array.from({ length: 6 }, (_, index) => <b key={`plume-${index}`} />)}
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
