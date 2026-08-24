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

const TRAIL_PARTICLE_COUNT = 16;
const SPARK_COUNT = 12;
type CursorState = "default" | "pointer" | "busy" | "danger" | "not-allowed";

function cursorStateFor(target: EventTarget | null): CursorState {
  if (!(target instanceof Element)) return "default";
  if (target.closest(":disabled, [aria-disabled='true']")) return "not-allowed";
  if (target.closest(".danger-button, .danger-solid-button, [data-cursor='danger']")) return "danger";
  if (target.closest("[aria-busy='true'], [data-cursor='busy'], .sync-spinner")) return "busy";
  if (
    target.closest(
      "a, button, summary, label[for], input[type='button'], input[type='submit'], input[type='reset'], input[type='radio'], input[type='checkbox'], [role='button'], [role='option'], [onclick]",
    )
  ) {
    return "pointer";
  }
  return "default";
}

export default function CursorThemeProvider({ children }: { children: ReactNode }) {
  const [pack, setPack] = useState<CursorPackId>(DEFAULT_CURSOR_PACK);
  const [effect, setEffect] = useState<CursorEffectId>(DEFAULT_CURSOR_EFFECT);
  const [ready, setReady] = useState(false);
  const [cursorState, setCursorState] = useState<CursorState>("default");
  const effectRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLImageElement>(null);
  const scrollAnchorRef = useRef<HTMLSpanElement>(null);
  const trailRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const cursorStateRef = useRef<CursorState>("default");

  useEffect(() => {
    try {
      const storedPack = window.localStorage.getItem(CURSOR_PACK_STORAGE_KEY);
      const storedEffect = window.localStorage.getItem(CURSOR_EFFECT_STORAGE_KEY);
      if (isCursorPackId(storedPack)) setPack(storedPack);
      if (isCursorEffectId(storedEffect)) setEffect(storedEffect);
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
    document.documentElement.dataset.cursorReady = "true";
    setReady(true);
    return () => {
      delete document.documentElement.dataset.cursorReady;
    };
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
    const middleScroll = {
      active: false,
      anchorX: 0,
      anchorY: 0,
      velocityX: 0,
      velocityY: 0,
    };
    const trail = Array.from({ length: TRAIL_PARTICLE_COUNT }, () => ({
      x: -200,
      y: -200,
    }));

    const moveAura = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      target.x = event.clientX;
      target.y = event.clientY;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${event.clientX - 5}px, ${event.clientY - 5}px, 0)`;
        cursorRef.current.classList.add("is-visible");
      }
      const nextState = middleScroll.active ? "busy" : cursorStateFor(event.target);
      if (nextState !== cursorStateRef.current) {
        cursorStateRef.current = nextState;
        setCursorState(nextState);
      }
      if (middleScroll.active) {
        middleScroll.velocityX = Math.max(-36, Math.min(36, (event.clientX - middleScroll.anchorX) * 0.16));
        middleScroll.velocityY = Math.max(-36, Math.min(36, (event.clientY - middleScroll.anchorY) * 0.16));
      }
      effectRef.current?.classList.add("is-active");
      document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
    };

    const hideAura = () => {
      effectRef.current?.classList.remove("is-active");
      cursorRef.current?.classList.remove("is-visible");
    };

    const startMiddleScroll = (event: MouseEvent) => {
      if (event.button !== 1 || (event.target instanceof Element && event.target.closest("a"))) return;
      event.preventDefault();
      middleScroll.active = true;
      middleScroll.anchorX = event.clientX;
      middleScroll.anchorY = event.clientY;
      middleScroll.velocityX = 0;
      middleScroll.velocityY = 0;
      cursorStateRef.current = "busy";
      setCursorState("busy");
      if (scrollAnchorRef.current) {
        scrollAnchorRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
        scrollAnchorRef.current.classList.add("is-active");
      }
    };

    const stopMiddleScroll = (event: MouseEvent) => {
      if (event.button !== 1 || !middleScroll.active) return;
      middleScroll.active = false;
      middleScroll.velocityX = 0;
      middleScroll.velocityY = 0;
      scrollAnchorRef.current?.classList.remove("is-active");
      const nextState = cursorStateFor(event.target);
      cursorStateRef.current = nextState;
      setCursorState(nextState);
    };

    const animateTrail = () => {
      if (middleScroll.active && (middleScroll.velocityX || middleScroll.velocityY)) {
        window.scrollBy(middleScroll.velocityX, middleScroll.velocityY);
      }
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
    window.addEventListener("mousedown", startMiddleScroll, { capture: true, passive: false });
    window.addEventListener("mouseup", stopMiddleScroll, { capture: true });
    document.documentElement.addEventListener("mouseleave", hideAura);
    frame = window.requestAnimationFrame(animateTrail);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", moveAura);
      window.removeEventListener("mousedown", startMiddleScroll, { capture: true });
      window.removeEventListener("mouseup", stopMiddleScroll, { capture: true });
      document.documentElement.removeEventListener("mouseleave", hideAura);
    };
  }, []);

  return (
    <>
      {children}
      {ready && (
        <img
          ref={cursorRef}
          className="custom-cursor"
          src={`/cursors/${pack}/${cursorState}.png`}
          width="64"
          height="64"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
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
        <span className="cursor-fx-plume">
          {Array.from({ length: 6 }, (_, index) => <b key={`plume-${index}`} />)}
        </span>
      </div>
      <span ref={scrollAnchorRef} className="cursor-scroll-anchor" aria-hidden="true"><i /><i /></span>
      <CursorSettings
        pack={pack}
        effect={effect}
        onPackChange={setPack}
        onEffectChange={setEffect}
      />
    </>
  );
}
