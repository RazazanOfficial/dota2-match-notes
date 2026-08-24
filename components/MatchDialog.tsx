"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleX, ImageIcon, Save, Trash2, X } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { QUEUE_OPTIONS, ROLE_OPTIONS, queueLabel, roleLabel } from "@/lib/constants";
import { newMatchId } from "@/lib/date";
import type { Hero, Match, MatchImage, MatchPick, MatchResult, MatchRole, QueueType } from "@/lib/types";
import BanPicker from "./BanPicker";
import ConfirmDialog from "./ConfirmDialog";
import DotaSelect from "./DotaSelect";
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
  picks: [],
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
  const [discardWarning, setDiscardWarning] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(false);
  const initializedSource = useRef("");
  const initialDraft = useRef("");
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
    setDiscardWarning(false);
    setDeleteWarning(false);
    const nextDraft = match
      ? structuredClone(match)
      : {
          ...EMPTY_MATCH,
          id: newMatchId(),
          number: nextNumber,
          createdAt: new Date().toISOString(),
        };
    setDraft(nextDraft);
    initialDraft.current = JSON.stringify(nextDraft);
  }, [dateLabel, match, nextNumber, open]);

  function requestClose() {
    if (JSON.stringify(draft) !== initialDraft.current) {
      setDiscardWarning(true);
      return;
    }
    onClose();
  }

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
              <X aria-hidden="true" />
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
            <div><span>رول</span><strong lang="en">{roleLabel(draft.role)}</strong></div>
            <div><span>نوع صف</span><strong lang="en">{queueLabel(draft.queueType)}</strong></div>
          </div>
          {draft.dotaMatchId && (
            <div className="detail-grid">
              <div><span>نوع بازی</span><strong lang="en">{draft.gameModeName || "—"}</strong></div>
              <div><span>نوع لابی</span><strong lang="en">{draft.lobbyTypeName || "—"}</strong></div>
            </div>
          )}
          <div className="detail-section">
            <span>هیروهای انتخاب‌شده</span>
            <DraftPicks picks={draft.picks} />
          </div>
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
          <MatchStats match={draft} />
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
    <div className="modal-backdrop" role="presentation" onMouseDown={requestClose}>
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
            setFormError("رول و نوع صف را انتخاب کنید");
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
          <button className="close-button" type="button" onClick={requestClose} aria-label="بستن">
            <X aria-hidden="true" />
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
          <DotaSelect<MatchRole>
            label="رول"
            value={draft.role}
            placeholder="انتخاب رول"
            options={ROLE_OPTIONS}
            required
            onChange={(role) => setDraft((current) => ({ ...current, role }))}
          />
          <DotaSelect<QueueType>
            label="نوع صف"
            value={draft.queueType}
            placeholder="انتخاب نوع صف"
            options={QUEUE_OPTIONS}
            required
            onChange={(queueType) => setDraft((current) => ({ ...current, queueType }))}
          />
          <BanPicker
            value={draft.bans}
            picks={draft.picks}
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
        <MatchStats match={draft} />
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
              onClick={() => setDeleteWarning(true)}
            >
              <Trash2 aria-hidden="true" /> حذف بازی
            </button>
          )}
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={requestClose}>
            <X aria-hidden="true" /> انصراف
          </button>
          <button className="primary-button" type="submit" disabled={busy}>
            <Save aria-hidden="true" /> {busy ? "در حال ثبت" : "ثبت بازی"}
          </button>
        </footer>
      </form>
      <ConfirmDialog
        open={discardWarning}
        title="تغییرات ذخیره نشده‌اند"
        description="اگر خارج شوید، تغییراتی که در این بازی انجام داده‌اید از بین می‌روند."
        confirmLabel="خروج بدون ذخیره"
        onCancel={() => setDiscardWarning(false)}
        onConfirm={onClose}
      />
      <ConfirmDialog
        open={deleteWarning}
        title="حذف این بازی؟"
        description="این بازی و یادداشت‌های آن از دفترچه حذف می‌شوند."
        confirmLabel="حذف بازی"
        tone="delete"
        onCancel={() => setDeleteWarning(false)}
        onConfirm={() => match && onDelete(match.id)}
      />
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
        {match.positivePoints.length ? <ul>{match.positivePoints.map((point, index) => <li key={`${point}-${index}`}><Check aria-hidden="true" />{point}</li>)}</ul> : <p>—</p>}
      </section>
      <section className="readonly-review is-negative">
        <strong>نکات منفی</strong>
        {match.negativePoints.length ? <ul>{match.negativePoints.map((point, index) => <li key={`${point}-${index}`}><CircleX aria-hidden="true" />{point}</li>)}</ul> : <p>—</p>}
      </section>
    </div>
  );
}

function DraftPicks({ picks }: { picks: MatchPick[] }) {
  if (!picks.length) return <p>—</p>;
  return (
    <div className="draft-picks" aria-label="هیروهای انتخاب‌شده توسط دیگر بازیکنان">
      {picks.map((pick) => (
        <span className={`draft-pick${pick.inRolePool ? " is-pool-priority" : ""}`} key={pick.id} title={pick.name}>
          <img src={heroImage(pick)} alt="" />
          <b lang="en" dir="ltr">{pick.name}</b>
        </span>
      ))}
    </div>
  );
}

function MatchStats({ match }: { match: Match }) {
  if (!match.dotaMatchId) return null;
  const duration = match.durationSeconds
    ? `${Math.floor(match.durationSeconds / 60)}:${String(match.durationSeconds % 60).padStart(2, "0")}`
    : "—";
  return (
    <section className="opendota-details" aria-label="آمار مچ">
      <header>
        <div>
          <span>خلاصه مچ</span>
          <strong lang="en" dir="ltr">Match #{match.dotaMatchId}</strong>
        </div>
        <span className="opendota-badge">Dota2Notes</span>
      </header>
      <div className="opendota-stat-grid">
        <DotaMetric icon="mode" label="نوع بازی" value={match.gameModeName || "—"} />
        <DotaMetric icon="mode" label="نوع لابی" value={match.lobbyTypeName || "—"} />
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
      ? "تصاویر این مچ هنوز آماده نشده‌اند."
      : match.imageJobStatus === "processing"
        ? "تصاویر این مچ در حال آماده‌شدن هستند."
        : "تصاویر این مچ به‌زودی آماده می‌شوند.";
    return (
      <section className={`generated-images-empty is-${match.imageJobStatus || "pending"}`}>
        <span className="image-build-icon"><ImageIcon aria-hidden="true" /></span>
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
