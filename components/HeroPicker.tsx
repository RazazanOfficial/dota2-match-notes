"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, TriangleAlert, X } from "lucide-react";
import { HEROES, heroImage } from "@/data/heroes";
import type { Hero } from "@/lib/types";

interface HeroPickerProps {
  label: string;
  value: Hero | null;
  onChange: (hero: Hero | null) => void;
  excludedIds?: number[];
  required?: boolean;
  invalid?: boolean;
  validationKey?: string;
}

export default function HeroPicker({
  label,
  value,
  onChange,
  excludedIds = [],
  required = false,
  invalid = false,
  validationKey,
}: HeroPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.name || "");
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(value?.name || ""), [value]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return HEROES.filter(
      (hero) =>
        !excludedIds.includes(hero.id) &&
        (!needle || hero.name.toLowerCase().includes(needle) || hero.slug.includes(needle)),
    ).slice(0, 30);
  }, [excludedIds, query]);

  return (
    <div
      className={`field hero-picker${invalid ? " is-invalid" : ""}`}
      data-required-field={validationKey}
      ref={rootRef}
    >
      <label htmlFor={listId}>{label}</label>
      <div className={`hero-picker-control${value ? " has-value" : ""}`}>
        {value && <img src={heroImage(value)} alt="" />}
        {!value && <Search className="hero-search-icon" aria-hidden="true" />}
        <input
          id={listId}
          value={query}
          lang="en"
          dir="ltr"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-options`}
          aria-invalid={invalid}
          placeholder="Search heroes"
          required={required}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value && event.target.value !== value.name) onChange(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open && results[0]) {
              event.preventDefault();
              onChange(results[0]);
              setOpen(false);
            }
          }}
        />
        {invalid && <TriangleAlert className="required-field-alert hero-required-alert" aria-hidden="true" />}
        {value && (
          <button
            className="hero-clear"
            type="button"
            aria-label={`حذف ${value.name}`}
            onClick={() => onChange(null)}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div className="hero-options" id={`${listId}-options`} role="listbox">
          {results.length ? (
            results.map((hero) => (
              <button
                key={hero.id}
                type="button"
                role="option"
                aria-selected={value?.id === hero.id}
                onClick={() => {
                  onChange(hero);
                  setOpen(false);
                }}
              >
                <img src={heroImage(hero)} alt="" loading="lazy" />
                <span lang="en" dir="ltr">
                  {hero.name}
                </span>
              </button>
            ))
          ) : (
            <span className="hero-empty">هیرویی پیدا نشد</span>
          )}
        </div>
      )}
    </div>
  );
}
