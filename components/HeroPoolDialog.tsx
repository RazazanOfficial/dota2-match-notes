"use client";

import { useEffect, useState } from "react";
import { heroImage } from "@/data/heroes";
import { roleLabel } from "@/lib/constants";
import { HERO_POOL_ROLES, heroPoolSizeState } from "@/lib/hero-pool/rules";
import type { Hero, HeroPoolData, MatchRole } from "@/lib/types";
import HeroPicker from "./HeroPicker";

const EMPTY_POOLS: HeroPoolData["pools"] = {
  safe_lane: [],
  mid_lane: [],
  off_lane: [],
  soft_support: [],
  hard_support: [],
};

export default function HeroPoolDialog({
  open,
  value,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  value: HeroPoolData | null;
  busy: boolean;
  onClose: () => void;
  onSave: (pools: HeroPoolData["pools"]) => Promise<void>;
}) {
  const [pools, setPools] = useState<HeroPoolData["pools"]>(EMPTY_POOLS);
  const [candidates, setCandidates] = useState<Partial<Record<MatchRole, Hero | null>>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPools(structuredClone(value?.pools || EMPTY_POOLS));
    setCandidates({});
    setError("");
  }, [open, value]);

  if (!open) return null;

  function add(role: MatchRole, hero: Hero | null) {
    setCandidates((current) => ({ ...current, [role]: hero }));
    if (!hero || pools[role].some((item) => item.id === hero.id) || pools[role].length >= 8) return;
    setPools((current) => ({ ...current, [role]: [...current[role], hero] }));
    queueMicrotask(() => setCandidates((current) => ({ ...current, [role]: null })));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal hero-pool-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={async (event) => {
          event.preventDefault();
          const incomplete = HERO_POOL_ROLES.find((role) => pools[role].length < 2);
          if (incomplete) {
            setError(`Hero Pool رول ${roleLabel(incomplete)} حداقل دو هیرو نیاز دارد`);
            return;
          }
          setError("");
          await onSave(pools);
        }}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker" lang="en">ROLE MASTERY</p>
            <h2>Hero Pool من</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن">×</button>
        </header>
        <div className="hero-pool-grid">
          {HERO_POOL_ROLES.map((role) => {
            const heroes = pools[role];
            const state = heroPoolSizeState(heroes.length);
            const label = state === "ideal" ? "متعادل" : state === "minimum" ? "متمرکز" : state === "caution" ? "گسترده" : "بیش‌ازحد گسترده";
            return (
              <section className={`hero-pool-role is-${state}`} key={role}>
                <header>
                  <strong lang="en">{roleLabel(role)}</strong>
                  <span>{heroes.length.toLocaleString("fa-IR")} / ۸ · {label}</span>
                </header>
                <HeroPicker
                  label="افزودن هیرو"
                  value={candidates[role] || null}
                  excludedIds={heroes.map((hero) => hero.id)}
                  onChange={(hero) => add(role, hero)}
                />
                <div className="hero-pool-portraits">
                  {heroes.map((hero) => (
                    <span key={hero.id}>
                      <img src={heroImage(hero)} alt="" />
                      <b lang="en">{hero.name}</b>
                      <button type="button" aria-label={`حذف ${hero.name}`} onClick={() => setPools((current) => ({ ...current, [role]: current[role].filter((item) => item.id !== hero.id) }))}>×</button>
                    </span>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <p className="form-error" role="alert">{error}</p>
        <footer className="modal-actions">
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={onClose}>انصراف</button>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "در حال ذخیره" : "ذخیره Hero Pool"}</button>
        </footer>
      </form>
    </div>
  );
}
