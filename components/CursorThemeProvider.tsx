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

const SPARK_COUNT = 8;

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
      // The defaults remain usable when local storage is unavailable.
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
      // The selected cursor still applies for the current page.
    }
  }, [effect, pack, ready]);

  useEffect(() => {
    const moveEffect = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
      effectRef.current?.classList.add("is-active");
    };
    const hideEffect = () => effectRef.current?.classList.remove("is-active");

    window.addEventListener("pointermove", moveEffect, { passive: true });
    document.documentElement.addEventListener("mouseleave", hideEffect);
    return () => {
      window.removeEventListener("pointermove", moveEffect);
      document.documentElement.removeEventListener("mouseleave", hideEffect);
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
