"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Check, CircleX, ImageIcon, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "react-toastify";
import { heroById, heroImage } from "@/data/heroes";
import { QUEUE_OPTIONS, ROLE_OPTIONS, queueLabel, roleLabel } from "@/lib/constants";
import { newMatchId } from "@/lib/date";
import type { Hero, Match, MatchImage, MatchResult, MatchRole, QueueType } from "@/lib/types";
import BanPicker from "./BanPicker";
import ConfirmDialog from "./ConfirmDialog";
import DotaSelect from "./DotaSelect";
import HeroPicker from "./HeroPicker";
import { GameIcon, type GameIconName } from "./GameIcon";
import GeneratedImageGallery from "./GeneratedImageGallery";
import MatchScoreboard from "./MatchScoreboard";
import MatchAnalysisPanel from "./MatchAnalysisPanel";
import ReviewListInput from "./ReviewListInput";

type MatchTab = "overview" | "performance" | "journal" | "media";
type RequiredMatchField = "number" | "role" | "queueType" | "hero";

const REQUIRED_FIELD_LABELS: Record<RequiredMatchField, string> = {
  number: "شماره بازی",
  role: "رول",
  queueType: "نوع صف",
  hero: "هیرو",
};

function requiredFieldsMessage(fields: RequiredMatchField[]) {
  if (!fields.length) return "";
  const labels = fields.map((field) => REQUIRED_FIELD_LABELS[field]);
  return fields.length === 1
    ? `برای ثبت بازی، فیلد «${labels[0]}» را تکمیل کنید.`
    : `برای ثبت بازی، فیلدهای اجباری زیر را تکمیل کنید: ${labels.join("، ")}.`;
}

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
  const [invalidFields, setInvalidFields] = useState<RequiredMatchField[]>([]);
  const [activeTab, setActiveTab] = useState<MatchTab>("overview");
  const [discardWarning, setDiscardWarning] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(false);
  const initializedSource = useRef("");
  const initialDraft = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const hero = draft.heroId ? heroById(draft.heroId) || null : null;
  const hasTeamDetails = Boolean(draft.participants?.length);
  const formError = requiredFieldsMessage(invalidFields);

  useEffect(() => {
    if (!open) {
      initializedSource.current = "";
      return;
    }
    const source = match?.id || `new:${dateLabel}`;
    if (initializedSource.current === source) return;
    initializedSource.current = source;
    setInvalidFields([]);
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

  useEffect(() => {
    if (invalidFields.length) return;
    toast.dismiss("match-required-fields");
  }, [invalidFields]);

  function requestClose() {
    if (JSON.stringify(draft) !== initialDraft.current) {
      setDiscardWarning(true);
      return;
    }
    onClose();
  }

  function clearInvalidField(field: RequiredMatchField) {
    setInvalidFields((current) => current.filter((item) => item !== field));
  }

  function showRequiredFields(missingFields: RequiredMatchField[]) {
    const message = requiredFieldsMessage(missingFields);

    setInvalidFields(missingFields);
    setActiveTab("overview");
    if (toast.isActive("match-required-fields")) {
      toast.update("match-required-fields", {
        render: message,
        type: "error",
        autoClose: 3_600,
      });
    } else {
      toast.error(message, { toastId: "match-required-fields" });
    }

    window.requestAnimationFrame(() => {
      const firstInvalidField = formRef.current?.querySelector<HTMLElement>(
        `[data-required-field="${missingFields[0]}"]`,
      );
      firstInvalidField?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        firstInvalidField?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
      }, 250);
    });
  }

  if (!open) return null;

  if (readonly) {
    return (
      <div className="match-workspace-shell">
        <section
          className="match-workspace match-modal"
          aria-labelledby="match-read-title"
        >
          <header className="match-workspace-header">
            <div>
              <p className="modal-kicker">MATCH WORKSPACE · {dateLabel}</p>
              <h2 id="match-read-title">جزئیات بازی</h2>
            </div>
            <button className="close-button" type="button" onClick={onClose} aria-label="بستن">
              <X aria-hidden="true" />
            </button>
          </header>
          <MatchTabs active={activeTab} onChange={setActiveTab} />
          <div className={`match-tab-panel${activeTab === "overview" ? " is-active" : ""}`} data-match-tab="overview">
            <ReadonlyMatchContext match={draft} />
            {hasTeamDetails
              ? <MatchScoreboard match={draft} />
              : <LegacyMatchOverview match={draft} hero={hero} />}
          </div>
          <div className={`match-tab-panel${activeTab === "performance" ? " is-active" : ""}`} data-match-tab="performance">
          <MatchAnalysisPanel match={draft} active={activeTab === "performance"} />
          </div>
          <div className={`match-tab-panel${activeTab === "journal" ? " is-active" : ""}`} data-match-tab="journal">
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
    <div className="match-workspace-shell">
      <form
        ref={formRef}
        className="match-workspace match-modal"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const missingFields: RequiredMatchField[] = [];
          if (!Number.isFinite(draft.number) || draft.number < 1) missingFields.push("number");
          if (!draft.role) missingFields.push("role");
          if (!draft.queueType) missingFields.push("queueType");
          if (!hero) missingFields.push("hero");
          if (missingFields.length) {
            showRequiredFields(missingFields);
            return;
          }
          if (!hero) return;
          setInvalidFields([]);
          onSave({ ...draft, heroId: hero.id, heroName: hero.name });
        }}
      >
        <header className="match-workspace-header">
          <div>
            <p className="modal-kicker">MATCH WORKSPACE · {dateLabel}</p>
            <h2>{match ? "ویرایش بازی" : "ثبت بازی"}</h2>
          </div>
          <button className="close-button" type="button" onClick={requestClose} aria-label="بستن">
            <X aria-hidden="true" />
          </button>
        </header>
        <MatchTabs active={activeTab} onChange={setActiveTab} />

        <div className={`match-tab-panel${activeTab === "overview" ? " is-active" : ""}`} data-match-tab="overview">
          <MatchPersonalEditor
            match={draft}
            formError={formError}
            invalidFields={invalidFields}
            onClearInvalid={clearInvalidField}
            onChange={setDraft}
          />
          {hasTeamDetails ? (
            <MatchScoreboard match={draft} />
          ) : (
            <>
              <div className="form-grid">
                <HeroPicker
                  label="هیرو"
                  value={hero}
                  required
                  invalid={invalidFields.includes("hero")}
                  validationKey="hero"
                  excludedIds={draft.bans.map((ban) => ban.id)}
                  onChange={(nextHero) => {
                    if (nextHero) clearInvalidField("hero");
                    setDraft((current) => ({
                      ...current,
                      heroId: nextHero?.id || null,
                      heroName: nextHero?.name || "",
                    }));
                  }}
                />
                <BanPicker
                  value={draft.bans}
                  picks={draft.picks}
                  pickedHeroId={draft.heroId}
                  legacyBans={draft.legacyBans}
                  onChange={(bans) => setDraft((current) => ({ ...current, bans }))}
                />
              </div>
              <MatchStats match={draft} />
            </>
          )}
        </div>

        <div className={`match-tab-panel${activeTab === "performance" ? " is-active" : ""}`} data-match-tab="performance">
          <MatchAnalysisPanel match={draft} active={activeTab === "performance"} onPositionOverrides={(updates) => setDraft((current) => ({ ...current, positionOverrides: { ...(current.positionOverrides || {}), ...updates } }))} />
        </div>

        <div className={`match-tab-panel${activeTab === "journal" ? " is-active" : ""}`} data-match-tab="journal">
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

function MatchPersonalEditor({
  match,
  formError,
  invalidFields,
  onClearInvalid,
  onChange,
}: {
  match: Match;
  formError: string;
  invalidFields: RequiredMatchField[];
  onClearInvalid: (field: RequiredMatchField) => void;
  onChange: Dispatch<SetStateAction<Match>>;
}) {
  return (
    <section className="match-personal-editor" aria-label="اطلاعات شخصی مچ">
      <div className="form-grid">
        <MatchNumberField
          value={match.number}
          invalid={invalidFields.includes("number")}
          onChange={(number) => {
            if (Number.isFinite(number) && number >= 1) onClearInvalid("number");
            onChange((current) => ({ ...current, number }));
          }}
        />
        <DotaSelect<MatchRole>
          label="رول"
          value={match.role}
          placeholder="انتخاب رول"
          options={ROLE_OPTIONS}
          required
          invalid={invalidFields.includes("role")}
          validationKey="role"
          onChange={(role) => {
            onClearInvalid("role");
            onChange((current) => ({ ...current, role }));
          }}
        />
        <DotaSelect<QueueType>
          label="نوع صف"
          value={match.queueType}
          placeholder="انتخاب نوع صف"
          options={QUEUE_OPTIONS}
          required
          invalid={invalidFields.includes("queueType")}
          validationKey="queueType"
          onChange={(queueType) => {
            onClearInvalid("queueType");
            onChange((current) => ({ ...current, queueType }));
          }}
        />
        <ResultField
          value={match.result}
          onChange={(result) => onChange((current) => ({ ...current, result }))}
        />
      </div>
      {formError && (
        <p className="form-error" id="match-required-error" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{formError}</span>
        </p>
      )}
    </section>
  );
}

function ReadonlyMatchContext({ match }: { match: Match }) {
  return (
    <section className="match-context-bar" aria-label="اطلاعات شخصی مچ">
      <span><small>شماره بازی</small><strong>{match.number.toLocaleString("fa-IR")}</strong></span>
      <span><small>رول</small><strong lang="en" dir="ltr">{roleLabel(match.role)}</strong></span>
      <span><small>نوع صف</small><strong lang="en" dir="ltr">{queueLabel(match.queueType)}</strong></span>
      <span>
        <small>نتیجه</small>
        <strong className={`is-${match.result}`}>{match.result === "win" ? "برد" : "باخت"}</strong>
      </span>
    </section>
  );
}

function MatchNumberField({
  value,
  invalid,
  onChange,
}: {
  value: number;
  invalid: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label
      className={`field${invalid ? " is-invalid" : ""}`}
      data-required-field="number"
    >
      <span>شماره بازی</span>
      <span className="required-field-control">
        <input
          type="number"
          min="1"
          value={value}
          required
          aria-invalid={invalid}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {invalid && <TriangleAlert className="required-field-alert" aria-hidden="true" />}
      </span>
    </label>
  );
}

function ResultField({
  value,
  onChange,
  fullWidth = false,
}: {
  value: MatchResult;
  onChange: (value: MatchResult) => void;
  fullWidth?: boolean;
}) {
  return (
    <fieldset className={`result-field${fullWidth ? " field-full" : ""}`}>
      <legend>نتیجه</legend>
      <div className="result-options">
        {(["win", "loss"] as MatchResult[]).map((result) => (
          <label className={`result-option result-option-${result}`} key={result}>
            <input type="radio" name="result" checked={value === result} onChange={() => onChange(result)} />
            <span>{result === "win" ? "برد" : "باخت"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LegacyMatchOverview({ match, hero }: { match: Match; hero: Hero | null }) {
  return (
    <>
      <div className={`match-detail-hero${match.heroPoolEligible ? match.heroPoolMatch ? " is-in-pool" : " is-outside-pool" : ""}`}>
        {hero && <img src={heroImage(hero)} alt="" />}
        <div>
          <span>هیرو</span>
          <strong lang="en" dir="ltr">{match.heroName || "—"}</strong>
        </div>
        <span className={`result-badge is-${match.result}`}>{match.result === "win" ? "برد" : "باخت"}</span>
      </div>
      <div className="detail-grid">
        <div><span>رول</span><strong lang="en">{roleLabel(match.role)}</strong></div>
        <div><span>نوع صف</span><strong lang="en">{queueLabel(match.queueType)}</strong></div>
      </div>
      {match.dotaMatchId && (
        <div className="detail-grid">
          <div><span>نوع بازی</span><strong lang="en">{match.gameModeName || "—"}</strong></div>
          <div><span>نوع لابی</span><strong lang="en">{match.lobbyTypeName || "—"}</strong></div>
        </div>
      )}
      <div className="detail-section">
        <span>بن‌ها</span>
        <div className="readonly-bans">
          {match.bans.length
            ? match.bans.map((ban) => (
                <span className={`ban-portrait${ban.inRolePool ? " is-pool-priority" : ""}`} key={ban.id}>
                  <span className="ban-portrait-image"><img src={heroImage(ban)} alt="" /></span>
                  <b lang="en">{ban.name}</b>
                </span>
              ))
            : match.legacyBans || "—"}
        </div>
      </div>
      <MatchStats match={match} />
    </>
  );
}

function MatchTabs({ active, onChange }: { active: MatchTab; onChange: (tab: MatchTab) => void }) {
  return (
    <nav className="match-modal-tabs" aria-label="بخش‌های مچ">
      <button className={active === "overview" ? "is-active" : ""} type="button" onClick={() => onChange("overview")}><span lang="en">Overview</span><small>اطلاعات مچ</small></button>
      <button className={active === "performance" ? "is-active" : ""} type="button" onClick={() => onChange("performance")}><span lang="en">Performance</span><small>مرور عملکرد</small></button>
      <button className={active === "journal" ? "is-active" : ""} type="button" onClick={() => onChange("journal")}>یادداشت‌ها</button>
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
