"use client";

import { useState } from "react";
import { heroImage } from "@/data/heroes";
import type { Hero } from "@/lib/types";
import HeroPicker from "./HeroPicker";

interface BanPickerProps {
  value: Hero[];
  onChange: (heroes: Hero[]) => void;
  pickedHeroId?: number | null;
  legacyBans?: string;
}

export default function BanPicker({
  value,
  onChange,
  pickedHeroId,
  legacyBans,
}: BanPickerProps) {
  const [candidate, setCandidate] = useState<Hero | null>(null);

  function add(hero: Hero | null) {
    setCandidate(hero);
    if (!hero || value.some((item) => item.id === hero.id)) return;
    onChange([...value, hero]);
    queueMicrotask(() => setCandidate(null));
  }

  return (
    <div className="field field-full ban-field">
      <HeroPicker
        label="بن‌ها"
        value={candidate}
        onChange={add}
        excludedIds={[...(pickedHeroId ? [pickedHeroId] : []), ...value.map((hero) => hero.id)]}
      />
      {(value.length > 0 || legacyBans) && (
        <div className="hero-chips">
          {value.map((hero) => (
            <span className="hero-chip" key={hero.id}>
              <img src={heroImage(hero)} alt="" />
              <span lang="en" dir="ltr">
                {hero.name}
              </span>
              <button
                type="button"
                aria-label={`حذف ${hero.name}`}
                onClick={() => onChange(value.filter((item) => item.id !== hero.id))}
              >
                ×
              </button>
            </span>
          ))}
          {legacyBans && <span className="legacy-ban">بن‌های قبلی: {legacyBans}</span>}
        </div>
      )}
    </div>
  );
}
