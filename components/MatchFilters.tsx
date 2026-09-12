"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { heroIcon } from "@/data/heroes";
import type { Hero, MatchRole } from "@/lib/types";

export type JournalModeFilter = `mode:${number}` | `lobby:${number}`;

const POSITIONS: Array<{ value: MatchRole; label: string; icon: string }> = [
  { value: "safe_lane", label: "Safe Lane", icon: "Safelane.png" },
  { value: "mid_lane", label: "Mid Lane", icon: "MidLane.png" },
  { value: "off_lane", label: "Off Lane", icon: "OffLane.png" },
  { value: "soft_support", label: "Soft Support", icon: "SoftSupport.png" },
  { value: "hard_support", label: "Hard Support", icon: "HardSupport.png" },
];

type FilterSection = "mode" | "position" | "hero";

function toggleValue<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function MatchFilters(props: {
  modeOptions: Array<{ value: JournalModeFilter; label: string }>;
  heroOptions: Hero[];
  selectedModes: JournalModeFilter[];
  selectedPositions: MatchRole[];
  selectedHeroes: number[];
  visibleCount: number;
  totalCount: number;
  onModesChange: (values: JournalModeFilter[]) => void;
  onPositionsChange: (values: MatchRole[]) => void;
  onHeroesChange: (values: number[]) => void;
  onReset: () => void;
}) {
  const { modeOptions, heroOptions, selectedModes, selectedPositions, selectedHeroes, visibleCount, totalCount, onModesChange, onPositionsChange, onHeroesChange, onReset } = props;
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<FilterSection>("mode");
  const [heroQuery, setHeroQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCount = selectedModes.length + selectedPositions.length + selectedHeroes.length;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const suggestions = useMemo(() => {
    const query = heroQuery.normalize("NFKC").trim().toLocaleLowerCase("en-US");
    if (query.length < 2) return [];
    return heroOptions.filter((hero) => hero.name.toLocaleLowerCase("en-US").includes(query)).slice(0, 12);
  }, [heroOptions, heroQuery]);
  const selectedHeroModels = heroOptions.filter((hero) => selectedHeroes.includes(hero.id));

  return (
    <div className="journal-filter" ref={rootRef}>
      <button className={`journal-filter-trigger${activeCount ? " is-active" : ""}`} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <SlidersHorizontal aria-hidden="true" />
        <span><strong>فیلتر مچ‌ها</strong><small>{activeCount ? `${visibleCount.toLocaleString("fa-IR")} از ${totalCount.toLocaleString("fa-IR")} مچ` : "Game Mode، Position و Hero"}</small></span>
        {activeCount > 0 && <b>{activeCount.toLocaleString("fa-IR")}</b>}
        <ChevronDown className={open ? "is-open" : ""} aria-hidden="true" />
      </button>

      {open && <section className="journal-filter-popover" role="dialog" aria-label="فیلتر مچ‌های این هفته">
        <header><div><strong>مچ‌هایی که می‌خواهی ببینی</strong><small>در هر گروه می‌توانی چند گزینه را هم‌زمان انتخاب کنی.</small></div><button type="button" aria-label="بستن فیلترها" onClick={() => setOpen(false)}><X /></button></header>
        <nav className="journal-filter-sections" aria-label="گروه فیلترها">
          <button type="button" className={section === "mode" ? "is-active" : ""} onClick={() => setSection("mode")}><span>Game Mode</span>{selectedModes.length > 0 && <b>{selectedModes.length.toLocaleString("fa-IR")}</b>}</button>
          <button type="button" className={section === "position" ? "is-active" : ""} onClick={() => setSection("position")}><span>Position</span>{selectedPositions.length > 0 && <b>{selectedPositions.length.toLocaleString("fa-IR")}</b>}</button>
          <button type="button" className={section === "hero" ? "is-active" : ""} onClick={() => setSection("hero")}><span>Hero</span>{selectedHeroes.length > 0 && <b>{selectedHeroes.length.toLocaleString("fa-IR")}</b>}</button>
        </nav>
        <div className="journal-filter-body">
          {section === "mode" && <div className="journal-filter-checks">{modeOptions.map((option) => { const checked = selectedModes.includes(option.value); return <button type="button" role="checkbox" aria-checked={checked} className={checked ? "is-checked" : ""} onClick={() => onModesChange(toggleValue(selectedModes, option.value))} key={option.value}><i>{checked && <Check />}</i><span lang="en" dir="ltr">{option.label}</span></button>; })}{!modeOptions.length && <p>برای این هفته Game Mode قابل انتخابی وجود ندارد.</p>}</div>}
          {section === "position" && <div className="journal-filter-checks is-positions">{POSITIONS.map((option) => { const checked = selectedPositions.includes(option.value); return <button type="button" role="checkbox" aria-checked={checked} className={checked ? "is-checked" : ""} onClick={() => onPositionsChange(toggleValue(selectedPositions, option.value))} key={option.value}><img src={`/positions/${option.icon}`} alt=""/><span lang="en" dir="ltr">{option.label}</span><i>{checked && <Check />}</i></button>; })}</div>}
          {section === "hero" && <div className="journal-hero-filter"><label><Search aria-hidden="true" /><input lang="en" dir="ltr" value={heroQuery} onChange={(event) => setHeroQuery(event.target.value)} placeholder="حداقل ۲ حرف از نام Hero…" autoComplete="off" />{heroQuery && <button type="button" aria-label="پاک‌کردن جست‌وجو" onClick={() => setHeroQuery("")}><X /></button>}</label>{selectedHeroModels.length > 0 && <div className="journal-selected-heroes">{selectedHeroModels.map((hero) => <button type="button" onClick={() => onHeroesChange(selectedHeroes.filter((id) => id !== hero.id))} key={hero.id}><img src={heroIcon(hero)} alt=""/><span lang="en">{hero.name}</span><X /></button>)}</div>}{heroQuery.trim().length < 2 ? <p className="journal-hero-filter-hint">Suggestion پس از واردکردن حرف دوم نمایش داده می‌شود.</p> : <div className="journal-hero-suggestions">{suggestions.map((hero) => { const checked = selectedHeroes.includes(hero.id); return <button type="button" className={checked ? "is-checked" : ""} onClick={() => onHeroesChange(toggleValue(selectedHeroes, hero.id))} key={hero.id}><img src={heroIcon(hero)} alt=""/><span lang="en" dir="ltr">{hero.name}</span><i>{checked && <Check />}</i></button>; })}{!suggestions.length && <p>Hero مطابق این جست‌وجو در مچ‌های این هفته نیست.</p>}</div>}</div>}
        </div>
        <footer><span>{activeCount ? `${activeCount.toLocaleString("fa-IR")} فیلتر فعال` : "هیچ فیلتری انتخاب نشده"}</span>{activeCount > 0 && <button type="button" onClick={onReset}><X /> حذف فیلترها</button>}</footer>
      </section>}
    </div>
  );
}
