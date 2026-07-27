"use client";

import { useEffect, useState } from "react";
import { heroById, heroImage } from "@/data/heroes";
import { QUEUE_OPTIONS, ROLE_OPTIONS, queueLabel, roleLabel } from "@/lib/constants";
import { newMatchId } from "@/lib/date";
import type { Hero, Match, MatchResult, MatchRole, QueueType } from "@/lib/types";
import BanPicker from "./BanPicker";
import HeroPicker from "./HeroPicker";

interface MatchDialogProps {
  open: boolean;
  readonly: boolean;
  dateLabel: string;
  match: Match | null;
  nextNumber: number;
  busy?: boolean;
  onClose: () => void;
  onSave: (match: Match) => void;
  onDelete: (matchId: string) => void;
}

const EMPTY_MATCH: Match = {
  id: "",
  number: 1,
  heroId: null,
  heroName: "",
  bans: [],
  role: "",
  queueType: "",
  notes: "",
  result: "win",
  createdAt: "",
};

export default function MatchDialog({
  open,
  readonly,
  dateLabel,
  match,
  nextNumber,
  busy = false,
  onClose,
  onSave,
  onDelete,
}: MatchDialogProps) {
  const [draft, setDraft] = useState<Match>(EMPTY_MATCH);
  const [formError, setFormError] = useState("");
  const hero = draft.heroId ? heroById(draft.heroId) || null : null;

  useEffect(() => {
    if (!open) return;
    setFormError("");
    setDraft(
      match
        ? structuredClone(match)
        : {
            ...EMPTY_MATCH,
            id: newMatchId(),
            number: nextNumber,
            createdAt: new Date().toISOString(),
          },
    );
  }, [match, nextNumber, open]);

  if (!open) return null;

  if (readonly) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section
          className="modal match-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-read-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="modal-header">
            <div>
              <p className="modal-kicker">{dateLabel}</p>
              <h2 id="match-read-title">بازی {draft.number.toLocaleString("fa-IR")}</h2>
            </div>
            <button className="close-button" type="button" onClick={onClose} aria-label="بستن">
              ×
            </button>
          </header>
          <div className="match-detail-hero">
            {hero && <img src={heroImage(hero)} alt="" />}
            <div>
              <span>هیرو</span>
              <strong lang="en" dir="ltr">
                {draft.heroName || "—"}
              </strong>
            </div>
            <span className={`result-badge is-${draft.result}`}>
              {draft.result === "win" ? "برد" : "باخت"}
            </span>
          </div>
          <div className="detail-grid">
            <div><span>Role</span><strong lang="en">{roleLabel(draft.role)}</strong></div>
            <div><span>Queue Type</span><strong lang="en">{queueLabel(draft.queueType)}</strong></div>
          </div>
          <div className="detail-section">
            <span>بن‌ها</span>
            <div className="readonly-bans">
              {draft.bans.length
                ? draft.bans.map((ban) => (
                    <span key={ban.id}>
                      <img src={heroImage(ban)} alt="" />
                      <b lang="en">{ban.name}</b>
                    </span>
                  ))
                : draft.legacyBans || "—"}
            </div>
          </div>
          <div className="detail-section">
            <span>یادداشت بازی</span>
            <p>{draft.notes || "—"}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal match-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!hero) {
            setFormError("یک هیرو از فهرست انتخاب کنید");
            return;
          }
          if (!draft.role || !draft.queueType) {
            setFormError("Role و Queue Type را انتخاب کنید");
            return;
          }
          setFormError("");
          onSave({ ...draft, heroId: hero.id, heroName: hero.name });
        }}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker">{dateLabel}</p>
            <h2>{match ? "ویرایش بازی" : "ثبت بازی"}</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن">
            ×
          </button>
        </header>

        <div className="form-grid">
          <label className="field">
            <span>شماره بازی</span>
            <input
              type="number"
              min="1"
              value={draft.number}
              required
              onChange={(event) =>
                setDraft((current) => ({ ...current, number: Number(event.target.value) }))
              }
            />
          </label>
          <HeroPicker
            label="هیرو"
            value={hero}
            required
            excludedIds={draft.bans.map((ban) => ban.id)}
            onChange={(nextHero) =>
              setDraft((current) => ({
                ...current,
                heroId: nextHero?.id || null,
                heroName: nextHero?.name || "",
              }))
            }
          />
          <label className="field">
            <span lang="en">Role</span>
            <select
              required
              value={draft.role}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  role: event.target.value as MatchRole,
                }))
              }
            >
              <option value="">انتخاب رول</option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} lang="en">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span lang="en">Queue Type</span>
            <select
              required
              value={draft.queueType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  queueType: event.target.value as QueueType,
                }))
              }
            >
              <option value="">انتخاب نوع صف</option>
              {QUEUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} lang="en">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <BanPicker
            value={draft.bans}
            pickedHeroId={draft.heroId}
            legacyBans={draft.legacyBans}
            onChange={(bans) => setDraft((current) => ({ ...current, bans }))}
          />
          <label className="field field-full">
            <span>یادداشت بازی</span>
            <textarea
              rows={5}
              maxLength={5000}
              value={draft.notes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </label>
          <fieldset className="result-field field-full">
            <legend>نتیجه</legend>
            <div className="result-options">
              {(["win", "loss"] as MatchResult[]).map((result) => (
                <label className={`result-option result-option-${result}`} key={result}>
                  <input
                    type="radio"
                    name="result"
                    checked={draft.result === result}
                    onChange={() => setDraft((current) => ({ ...current, result }))}
                  />
                  <span>{result === "win" ? "برد" : "باخت"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="form-error field-full" role="alert">{formError}</p>
        </div>

        <footer className="modal-actions">
          {match && (
            <button
              className="secondary-button danger-button"
              type="button"
              disabled={busy}
              onClick={() => onDelete(match.id)}
            >
              حذف بازی
            </button>
          )}
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={onClose}>
            انصراف
          </button>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "در حال ثبت" : "ثبت بازی"}
          </button>
        </footer>
      </form>
    </div>
  );
}
