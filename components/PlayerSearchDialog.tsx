"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search, UserRoundSearch, X } from "lucide-react";

export default function PlayerSearchDialog({
  open,
  busy,
  onClose,
  onSearch,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSearch: (identifier: string) => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdentifier("");
    setError("");
  }, [open]);
  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onSearch(identifier);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "بازیکن پیدا نشد");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal player-search-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div><p className="modal-kicker" lang="en">PLAYER SEARCH</p><h2>دیدن دفتر یک بازیکن</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن"><X aria-hidden="true" /></button>
        </header>
        <div className="player-search-hero"><UserRoundSearch aria-hidden="true" /><p>Steam Account ID یا شناسه Dota2Notes بازیکن را وارد کن.</p></div>
        <label className="field"><span>شناسه بازیکن</span><input lang="en" dir="ltr" autoComplete="off" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="steam_123456789" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions"><span className="action-spacer" /><button className="primary-button" type="submit" disabled={busy}><Search aria-hidden="true" /> {busy ? "در حال جست‌وجو" : "مشاهده دفتر"}</button></footer>
      </form>
    </div>
  );
}
