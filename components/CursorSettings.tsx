"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  CURSOR_EFFECTS,
  CURSOR_PACKS,
  type CursorEffectId,
  type CursorPackId,
} from "@/lib/cursor-theme";

type CursorSettingsProps = {
  pack: CursorPackId;
  effect: CursorEffectId;
  onPackChange: (pack: CursorPackId) => void;
  onEffectChange: (effect: CursorEffectId) => void;
};

export default function CursorSettings({
  pack,
  effect,
  onPackChange,
  onEffectChange,
}: CursorSettingsProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="cursor-settings-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Image
          src={`/cursors/${pack}/default.png`}
          width={32}
          height={32}
          alt=""
          aria-hidden="true"
          priority
        />
        <span>ظاهر نشانگر</span>
      </button>

      {open ? (
        <div className="cursor-settings-layer">
          <button
            type="button"
            className="cursor-settings-backdrop"
            aria-label="بستن تنظیمات نشانگر"
            onClick={() => setOpen(false)}
          />
          <section
            className="cursor-settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cursor-settings-title"
          >
            <header>
              <div>
                <span autoCapitalize="words" className="eyebrow">CURSOR CUSTOMIZATION</span>
                <h2 id="cursor-settings-title">تنظیم نشانگر</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="cursor-settings-close"
                aria-label="بستن"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <fieldset>
              <legend>CURSOR PACK</legend>
              <div className="cursor-pack-grid">
                {CURSOR_PACKS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cursor-pack-card"
                    aria-pressed={pack === item.id}
                    onClick={() => onPackChange(item.id)}
                  >
                    <Image
                      src={`/cursors/${item.id}/default.png`}
                      width={56}
                      height={56}
                      alt=""
                      aria-hidden="true"
                    />
                    <span>{item.label}</span>
                    <small>{pack === item.id ? "فعال" : "انتخاب"}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>CURSOR AURA</legend>
              <div className="cursor-effect-grid">
                {CURSOR_EFFECTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`cursor-effect-card effect-${item.id}`}
                    aria-pressed={effect === item.id}
                    onClick={() => onEffectChange(item.id)}
                  >
                    <span className="cursor-effect-preview" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </section>
        </div>
      ) : null}
    </>
  );
}

