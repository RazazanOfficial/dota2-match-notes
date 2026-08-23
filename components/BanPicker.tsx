"use client";

import { useState } from "react";
import { heroImage } from "@/data/heroes";
import type { Hero, MatchBan } from "@/lib/types";
import HeroPicker from "./HeroPicker";

interface BanPickerProps {
  value: MatchBan[];
  onChange: (heroes: MatchBan[]) => void;
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
  const automatic = value.some((hero) => hero.source && hero.source !== "manual");

  function add(hero: Hero | null) {
    setCandidate(hero);
    if (!hero || value.some((item) => item.id === hero.id)) return;
    onChange([...value, hero]);
    queueMicrotask(() => setCandidate(null));
  }

  return (
    <div className="field field-full ban-field">
      {automatic ? (
        <div className="automatic-ban-heading"><span>بن‌های مچ</span><b>Dota2Notes</b></div>
      ) : (
        <HeroPicker
          label="بن‌ها"
          value={candidate}
          onChange={add}
          excludedIds={[...(pickedHeroId ? [pickedHeroId] : []), ...value.map((hero) => hero.id)]}
        />
      )}
      {(value.length > 0 || legacyBans) && (
        <div className="hero-chips">
          {value.map((hero) => (
            <span className={`hero-chip ban-portrait${hero.inRolePool ? " is-pool-priority" : ""}`} key={hero.id}>
              <span className="ban-portrait-image"><img src={heroImage(hero)} alt="" /></span>
              <span lang="en" dir="ltr">
                {hero.name}
              </span>
              {!automatic && <button type="button" aria-label={`حذف ${hero.name}`} onClick={() => onChange(value.filter((item) => item.id !== hero.id))}>×</button>}
            </span>
          ))}
          {legacyBans && <span className="legacy-ban">بن‌های قبلی: {legacyBans}</span>}
        </div>
      )}
    </div>
  );
}
