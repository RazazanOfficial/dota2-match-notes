"use client";

import { useState } from "react";

export default function ReviewListInput({
  tone,
  label,
  value,
  onChange,
}: {
  tone: "positive" | "negative";
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const point = draft.trim();
    if (!point || value.includes(point) || value.length >= 20) return;
    onChange([...value, point]);
    setDraft("");
  }

  return (
    <section className={`review-list is-${tone}`}>
      <header><span>{tone === "positive" ? "✓" : "×"}</span><strong>{label}</strong><b>{value.length.toLocaleString("fa-IR")}</b></header>
      <div className="review-point-entry">
        <input
          value={draft}
          maxLength={240}
          placeholder={tone === "positive" ? "یک تصمیم خوب..." : "یک مورد قابل بهبود..."}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
        />
        <button type="button" onClick={commit} aria-label="افزودن">+</button>
      </div>
      <ul>
        {value.map((point, index) => (
          <li key={`${point}-${index}`}>
            <span>{tone === "positive" ? "✓" : "×"}</span>
            <p>{point}</p>
            <button type="button" aria-label="حذف" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

