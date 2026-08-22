"use client";

import { useEffect, useRef, useState } from "react";
import { heroById, heroImage } from "@/data/heroes";
import { QUEUE_OPTIONS, ROLE_OPTIONS, queueLabel, roleLabel } from "@/lib/constants";
import { newMatchId } from "@/lib/date";
import type { Hero, Match, MatchImage, MatchResult, MatchRole, QueueType } from "@/lib/types";
import BanPicker from "./BanPicker";
import HeroPicker from "./HeroPicker";
import { GameIcon, type GameIconName } from "./GameIcon";
import GeneratedImageGallery from "./GeneratedImageGallery";
import ReviewListInput from "./ReviewListInput";

type MatchTab = "overview" | "review" | "media";

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
  positivePoints: [],
  negativePoints: [],
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
  const [activeTab, setActiveTab] = useState<MatchTab>("overview");
  const initializedSource = useRef("");
  const hero = draft.heroId ? heroById(draft.heroId) || null : null;

  useEffect(() => {
    if (!open) {
      initializedSource.current = "";
      return;
    }
    const source = match?.id || `new:${dateLabel}`;
    if (initializedSource.current === source) return;
    initializedSource.current = source;
    setFormError("");
    setActiveTab("overview");
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
  }, [dateLabel, match, nextNumber, open]);

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
          <MatchTabs active={activeTab} onChange={setActiveTab} />
          <div className={`match-tab-panel${activeTab === "overview" ? " is-active" : ""}`} data-match-tab="overview">
          <div className={`match-detail-hero${draft.heroPoolEligible ? draft.heroPoolMatch ? " is-in-pool" : " is-outside-pool" : ""}`}>
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
          {draft.dotaMatchId && (
            <div className="detail-grid">
              <div><span>Game Mode</span><strong lang="en">{draft.gameModeName || "—"}</strong></div>
              <div><span>Lobby</span><strong lang="en">{draft.lobbyTypeName || "—"}</strong></div>
            </div>
          )}
          <div className="detail-section">
            <span>بن‌ها</span>
            <div className="readonly-bans">
              {draft.bans.length
                ? draft.bans.map((ban) => (
                    <span className={`ban-portrait${ban.inRolePool ? " is-pool-priority" : ""}`} key={ban.id}>
                      <span className="ban-portrait-image"><img src={heroImage(ban)} alt="" /></span>
                      <b lang="en">{ban.name}</b>
                    </span>
                  ))
                : draft.legacyBans || "—"}
            </div>
          </div>
          <OpenDotaDetails match={draft} />
          </div>
          <div className={`match-tab-panel${activeTab === "review" ? " is-active" : ""}`} data-match-tab="review">
          <div className="detail-section">
            <span>یادداشت بازی</span>
            <p>{draft.notes || "—"}</p>
          </div>
          <ReadonlyReview match={draft} />
          </div>
          <div className={`match-tab-panel${activeTab === "media" ? " is-active" : ""}`} data-match-tab="media">
          <GeneratedImages match={draft} />
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
        <MatchTabs active={activeTab} onChange={setActiveTab} />

        <div className={`match-tab-panel${activeTab === "overview" ? " is-active" : ""}`} data-match-tab="overview">
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
        <OpenDotaDetails match={draft} />
        </div>

        <div className={`match-tab-panel${activeTab === "review" ? " is-active" : ""}`} data-match-tab="review">
          <div className="match-review-layout">
            <label className="field match-general-notes">
              <span>یادداشت بازی</span>
              <textarea rows={12} maxLength={5000} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <div className="match-review-lists">
              <ReviewListInput tone="positive" label="نکات مثبت" value={draft.positivePoints} onChange={(positivePoints) => setDraft((current) => ({ ...current, positivePoints }))} />
              <ReviewListInput tone="negative" label="نکات منفی" value={draft.negativePoints} onChange={(negativePoints) => setDraft((current) => ({ ...current, negativePoints }))} />
            </div>
          </div>
        </div>

        <div className={`match-tab-panel${activeTab === "media" ? " is-active" : ""}`} data-match-tab="media">
        <GeneratedImages match={draft} />
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

function MatchTabs({ active, onChange }: { active: MatchTab; onChange: (tab: MatchTab) => void }) {
  return (
    <nav className="match-modal-tabs" aria-label="بخش‌های مچ">
      <button className={active === "overview" ? "is-active" : ""} type="button" onClick={() => onChange("overview")}>اطلاعات مچ</button>
      <button className={active === "review" ? "is-active" : ""} type="button" onClick={() => onChange("review")}>مرور عملکرد</button>
      <button className={active === "media" ? "is-active" : ""} type="button" onClick={() => onChange("media")}>تصاویر</button>
    </nav>
  );
}

function ReadonlyReview({ match }: { match: Match }) {
  return (
    <div className="readonly-review-grid">
      <section className="readonly-review is-positive">
        <strong>نکات مثبت</strong>
        {match.positivePoints.length ? <ul>{match.positivePoints.map((point, index) => <li key={`${point}-${index}`}><span>✓</span>{point}</li>)}</ul> : <p>—</p>}
      </section>
      <section className="readonly-review is-negative">
        <strong>نکات منفی</strong>
        {match.negativePoints.length ? <ul>{match.negativePoints.map((point, index) => <li key={`${point}-${index}`}><span>×</span>{point}</li>)}</ul> : <p>—</p>}
      </section>
    </div>
  );
}

function OpenDotaDetails({ match }: { match: Match }) {
  if (!match.dotaMatchId) return null;
  const duration = match.durationSeconds
    ? `${Math.floor(match.durationSeconds / 60)}:${String(match.durationSeconds % 60).padStart(2, "0")}`
    : "—";
  return (
    <section className="opendota-details" aria-label="آمار OpenDota">
      <header>
        <div>
          <span>اطلاعات خودکار</span>
          <strong lang="en" dir="ltr">Match #{match.dotaMatchId}</strong>
        </div>
        <span className="opendota-badge">OpenDota</span>
      </header>
      <div className="opendota-stat-grid">
        <DotaMetric icon="mode" label="نوع بازی" value={match.gameModeName || "—"} />
        <DotaMetric icon="mode" label="Lobby" value={match.lobbyTypeName || "—"} />
        <DotaMetric icon="clock" label="مدت" value={duration} ltr />
        <DotaMetric icon="kda" label="K / D / A" value={`${match.kills ?? "—"} / ${match.deaths ?? "—"} / ${match.assists ?? "—"}`} ltr />
        <DotaMetric icon="gold" label="Gold / Minute" value={match.goldPerMinute ?? "—"} tone="gold" ltr />
        <DotaMetric icon="xp" label="XP / Minute" value={match.xpPerMinute ?? "—"} tone="xp" ltr />
        <DotaMetric icon="gold" label="Net Worth" value={match.netWorth?.toLocaleString("en-US") || "—"} tone="gold" ltr />
        <DotaMetric icon="damage" label="Hero Damage" value={match.heroDamage?.toLocaleString("en-US") || "—"} tone="damage" ltr />
      </div>
    </section>
  );
}

function DotaMetric({
  icon,
  label,
  value,
  tone = "",
  ltr = false,
}: {
  icon: GameIconName;
  label: string;
  value: string | number;
  tone?: "" | "gold" | "xp" | "damage";
  ltr?: boolean;
}) {
  return (
    <div className={`dota-metric${tone ? ` is-${tone}` : ""}`}>
      <span className="dota-metric-icon"><GameIcon name={icon} /></span>
      <span className="dota-metric-copy">
        <small>{label}</small>
        <strong lang={ltr ? "en" : undefined} dir={ltr ? "ltr" : undefined}>{value}</strong>
      </span>
    </div>
  );
}

function GeneratedImages({ match }: { match: Match }) {
  const [images, setImages] = useState<MatchImage[]>(match.images || []);

  useEffect(() => {
    setImages(match.images || []);
    if (!match.dotaMatchId || (match.images?.length || 0) >= 3) return;
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/matches/${match.id}/images`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = await response.json() as { images?: MatchImage[] };
        if (!cancelled && body.images?.length) setImages(body.images);
      } catch {
        // Queue polling in the main page remains the source of truth on failure.
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [match.dotaMatchId, match.id, match.images]);

  if (!match.dotaMatchId) return null;

  if (!images.length) {
    const label = match.imageJobStatus === "failed"
      ? "ساخت تصاویر ناموفق بود و توسط سرور دوباره بررسی می‌شود."
      : match.imageJobStatus === "processing"
        ? "تصاویر همین حالا در حال ساخته‌شدن هستند."
        : "تصاویر این مچ در صف ساخت قرار دارند.";
    return (
      <section className={`generated-images-empty is-${match.imageJobStatus || "pending"}`}>
        <span className="image-build-icon">◫</span>
        <div><strong>تصاویر گزارش</strong><p>{label}</p></div>
      </section>
    );
  }

  return (
    <section className="generated-images" aria-label="تصاویر گزارش مچ">
      <header><span>تصاویر گزارش</span><strong>{images.length.toLocaleString("fa-IR")} تصویر آماده</strong></header>
      <GeneratedImageGallery images={images} matchId={match.dotaMatchId} />
    </section>
  );
}
