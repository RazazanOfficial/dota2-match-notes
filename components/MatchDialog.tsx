"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowRight, Check, CircleX, ImageIcon, Save, TriangleAlert, X } from "lucide-react";
import { toast } from "react-toastify";
import { heroById, heroIcon, heroImage } from "@/data/heroes";
import { QUEUE_OPTIONS, queueLabel, roleLabel } from "@/lib/constants";
import { newMatchId } from "@/lib/date";
import type { Hero, Match, MatchImage, MatchParticipant, MatchPreparationProgress, MatchResult, MatchRole, QueueType } from "@/lib/types";
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
  presentation?: "overlay" | "page";
  readonly: boolean;
  dateLabel: string;
  match: Match | null;
  nextNumber: number;
  busy?: boolean;
  onClose: () => void;
  onSave: (match: Match) => void;
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
  presentation = "overlay",
  readonly,
  dateLabel,
  match,
  nextNumber,
  busy = false,
  onClose,
  onSave,
}: MatchDialogProps) {
  const [draft, setDraft] = useState<Match>(EMPTY_MATCH);
  const [invalidFields, setInvalidFields] = useState<RequiredMatchField[]>([]);
  const [activeTab, setActiveTab] = useState<MatchTab>("overview");
  const [discardWarning, setDiscardWarning] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
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
    const nextDraft = match
      ? structuredClone(match)
      : {
          ...EMPTY_MATCH,
          id: newMatchId(),
          number: nextNumber,
          createdAt: new Date().toISOString(),
        };
    setDraft(nextDraft);
    const profileParticipant = nextDraft.participants?.find((entry) => entry.isProfilePlayer)
      || nextDraft.participants?.find((entry) => entry.heroId === nextDraft.heroId)
      || nextDraft.participants?.[0];
    setSelectedSlot(profileParticipant?.playerSlot ?? null);
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
  const selectedParticipant = draft.participants?.find((entry) => entry.playerSlot === selectedSlot)
    || draft.participants?.find((entry) => entry.isProfilePlayer)
    || draft.participants?.[0]
    || null;

  if (readonly) {
    return (
      <div className={`match-workspace-shell${presentation === "page" ? " is-page" : ""}`}>
        <section
          className="match-workspace match-modal"
          aria-labelledby="match-read-title"
        >
          <header className="match-workspace-header">
            <div>
              <p className="modal-kicker">MATCH #{draft.dotaMatchId || draft.number} · {dateLabel}</p>
              <h2 id="match-read-title">جزئیات Match</h2>
            </div>
            <button className="close-button" type="button" onClick={onClose} aria-label={presentation === "page" ? "بازگشت" : "بستن"}>
              {presentation === "page" ? <ArrowRight aria-hidden="true" /> : <X aria-hidden="true" />}
            </button>
          </header>
          <MatchTabs active={activeTab} onChange={setActiveTab} />
          <div className={`match-tab-panel${activeTab === "overview" ? " is-active" : ""}`} data-match-tab="overview">
            <ReadonlyMatchContext match={draft} participant={selectedParticipant} />
            {hasTeamDetails
              ? <MatchScoreboard match={draft} selectedSlot={selectedSlot} onSelectParticipant={(entry) => setSelectedSlot(entry.playerSlot)} />
              : <LegacyMatchOverview match={draft} hero={hero} />}
          </div>
          <div className={`match-tab-panel${activeTab === "performance" ? " is-active" : ""}`} data-match-tab="performance">
          <MatchAnalysisPanel match={draft} active={activeTab === "performance"} canRequestAnalysis={false} selectedPlayerSlot={selectedSlot} onSelectPlayer={setSelectedSlot} />
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
    <div className={`match-workspace-shell${presentation === "page" ? " is-page" : ""}`}>
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
            <p className="modal-kicker">{match ? `MATCH #${draft.dotaMatchId || draft.number}` : "NEW MATCH"} · {dateLabel}</p>
            {match && presentation === "page" ? <h2>جزئیات Match</h2> : !match ? <h2>ثبت بازی</h2> : null}
          </div>
          <button className="close-button" type="button" onClick={requestClose} aria-label={presentation === "page" ? "بازگشت" : "بستن"}>
            {presentation === "page" ? <ArrowRight aria-hidden="true" /> : <X aria-hidden="true" />}
          </button>
        </header>
        <MatchTabs active={activeTab} onChange={setActiveTab} />

        <div className={`match-tab-panel${activeTab === "overview" ? " is-active" : ""}`} data-match-tab="overview">
          <MatchPersonalEditor
            match={draft}
            formError={formError}
            invalidFields={invalidFields}
            participant={selectedParticipant}
            onClearInvalid={clearInvalidField}
            onChange={setDraft}
          />
          {hasTeamDetails ? (
            <MatchScoreboard match={draft} selectedSlot={selectedSlot} onSelectParticipant={(entry) => setSelectedSlot(entry.playerSlot)} />
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
                  manualOverride={draft.banOverride}
                  onChange={(bans) => setDraft((current) => ({ ...current, bans, banOverride: true }))}
                  onReset={() => setDraft((current) => ({ ...current, banOverride: false, bans: match?.banOverride ? [] : match?.bans ?? [] }))}
                />
              </div>
              <MatchStats match={draft} />
            </>
          )}
        </div>

        <div className={`match-tab-panel${activeTab === "performance" ? " is-active" : ""}`} data-match-tab="performance">
          <MatchAnalysisPanel match={draft} active={activeTab === "performance"} canRequestAnalysis selectedPlayerSlot={selectedSlot} onSelectPlayer={setSelectedSlot} onPositionOverrides={(updates) => setDraft((current) => ({ ...current, positionOverrides: { ...(current.positionOverrides || {}), ...updates }, participants: current.participants?.map((entry) => updates[String(entry.playerSlot)] ? { ...entry, position: updates[String(entry.playerSlot)] } : entry) }))} />
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
    </div>
  );
}

function MatchPersonalEditor({
  match,
  formError,
  invalidFields,
  participant,
  onClearInvalid,
  onChange,
}: {
  match: Match;
  formError: string;
  invalidFields: RequiredMatchField[];
  participant: MatchParticipant | null;
  onClearInvalid: (field: RequiredMatchField) => void;
  onChange: Dispatch<SetStateAction<Match>>;
}) {
  return (
    <section className="match-personal-editor" aria-label="اطلاعات شخصی مچ">
      <div className="form-grid">
        <MatchNumberField value={match.number} invalid={false} readOnly onChange={() => undefined} />
        <ReadonlyRoleField participant={participant} fallback={roleLabel(match.role)} />
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
        <ResultField value={participantResult(match, participant)} readOnly onChange={() => undefined} />
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

function ReadonlyMatchContext({ match, participant }: { match: Match; participant: MatchParticipant | null }) {
  return (
    <section className="match-context-bar" aria-label="اطلاعات شخصی مچ">
      <span><small>شماره بازی</small><strong>{match.number.toLocaleString("fa-IR")}</strong></span>
      <span className="match-readonly-role"><small>رول</small><ReadonlyRole participant={participant} fallback={roleLabel(match.role)} /></span>
      <span><small>نوع صف</small><strong lang="en" dir="ltr">{queueLabel(match.queueType)}</strong></span>
      <span>
        <small>نتیجه</small>
        <strong className={`is-${participantResult(match, participant)}`}>{participantResult(match, participant) === "win" ? "برد" : "باخت"}</strong>
      </span>
    </section>
  );
}

function ReadonlyRole({ participant, fallback }: { participant: MatchParticipant | null; fallback: string }) {
  const hero = participant ? heroById(participant.heroId) : null;
  const position = participant?.position ?? null;
  const label = position ? ["", "Safe Lane", "Mid Lane", "Off Lane", "Soft Support", "Hard Support"][position] : fallback;
  return <strong className="match-readonly-role-value" lang="en" dir="ltr">{hero && <img src={heroIcon(hero)} alt="" />}{label || "—"}</strong>;
}

function ReadonlyRoleField({ participant, fallback }: { participant: MatchParticipant | null; fallback: string }) {
  return <label className="field"><span>رول</span><button className="dota-select-trigger match-role-readonly-trigger" type="button" disabled><ReadonlyRole participant={participant} fallback={fallback} /></button></label>;
}

function participantResult(match: Match, participant: MatchParticipant | null): MatchResult {
  if (!participant || match.radiantWin === null || match.radiantWin === undefined) return match.result;
  return match.radiantWin === (participant.team === "radiant") ? "win" : "loss";
}

function MatchNumberField({
  value,
  invalid,
  readOnly = false,
  onChange,
}: {
  value: number;
  invalid: boolean;
  readOnly?: boolean;
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
          readOnly={readOnly}
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
  readOnly = false,
}: {
  value: MatchResult;
  onChange: (value: MatchResult) => void;
  fullWidth?: boolean;
  readOnly?: boolean;
}) {
  return (
    <fieldset className={`result-field${fullWidth ? " field-full" : ""}`}>
      <legend>نتیجه</legend>
      <div className="result-options">
        {(["win", "loss"] as MatchResult[]).map((result) => (
          <label className={`result-option result-option-${result}`} key={result}>
            <input type="radio" name="result" checked={value === result} disabled={readOnly} onChange={() => onChange(result)} />
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
      <button className={active === "journal" ? "is-active" : ""} type="button" onClick={() => onChange("journal")}><span lang="en">Journal</span><small>یادداشت‌ها</small></button>
      <button className={active === "media" ? "is-active" : ""} type="button" onClick={() => onChange("media")}><span lang="en">Media</span><small>تصاویر</small></button>
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
  const [preparation, setPreparation] = useState<MatchPreparationProgress | null>(null);

  useEffect(() => {
    setImages(match.images || []);
    if (!match.dotaMatchId) return;
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/matches/${match.id}/images`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = await response.json() as { images?: MatchImage[]; preparation?: MatchPreparationProgress };
        if (!cancelled) {
          if (body.images) setImages(body.images);
          if (body.preparation) setPreparation(body.preparation);
        }
      } catch { /* The next poll retries without replacing already loaded images. */ }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [match.dotaMatchId, match.id, match.images]);

  if (!match.dotaMatchId) return null;

  const done = images.length >= 3 || preparation?.status === "ready";

  return (
    <section className="generated-images" aria-label="تصاویر گزارش مچ">
      <header><span>تصاویر گزارش</span><strong>{images.length.toLocaleString("fa-IR")} از ۳ تصویر آماده</strong></header>
      {!done && preparation?.status !== "idle" && <PreparationSteps preparation={preparation} fallbackStatus={match.imageJobStatus} />}
      {images.length > 0 ? <GeneratedImageGallery images={images} matchId={match.dotaMatchId} /> : <div className="generated-images-waiting"><span className="image-build-icon"><ImageIcon aria-hidden="true" /></span><p>تصویر آماده‌ای برای نمایش وجود ندارد؛ وضعیت صف همین‌جا به‌روز می‌شود.</p></div>}
      {!done && preparation?.status === "idle" && <p className="generated-images-analysis-note">برای ساخت تصاویر، ابتدا تحلیل Replay را از تب Performance درخواست کنید.</p>}
    </section>
  );
}

function etaLabel(seconds: number | null | undefined, sampleSize = 0) {
  if (!seconds || sampleSize < 1) return "زمان تقریبی پس از اولین نمونه واقعی مشخص می‌شود";
  if (seconds < 60) return `حدود ${seconds.toLocaleString("fa-IR")} ثانیه`;
  return `حدود ${Math.ceil(seconds / 60).toLocaleString("fa-IR")} دقیقه`;
}

function PreparationSteps({ preparation, fallbackStatus }: { preparation: MatchPreparationProgress | null; fallbackStatus?: Match["imageJobStatus"] }) {
  const analysisActive = preparation?.status === "analysis";
  const image = preparation?.images;
  const completed = image?.completedImages || 0;
  const current = image?.currentImage || 0;
  const names = ["Match Overview", "Team Scoreboard", "Player Performance"];
  const failed = preparation?.status === "failed" || image?.status === "failed" || fallbackStatus === "failed";
  return <div className={`match-preparation${failed ? " is-failed" : ""}`}>
    <div className="match-preparation-summary"><span className="image-build-icon"><ImageIcon aria-hidden="true" /></span><div><strong>{failed ? "آماده‌سازی این مچ کامل نشد" : analysisActive ? "در حال آماده‌سازی داده Analysis" : image?.status === "processing" ? "در حال ساخت تصاویر" : "در صف آماده‌سازی"}</strong><p>{failed ? "جزئیات خطا در Worker ثبت شده است." : `${preparation?.position ? `جایگاه فعلی: نوبت ${preparation.position.toLocaleString("fa-IR")} در صف` : "وضعیت صف در حال دریافت است"} · ${etaLabel(image?.estimatedSeconds, image?.sampleSize)}`}</p></div></div>
    <div className="match-preparation-steps">{names.map((name,index)=>{const number=index+1;const state=completed>=number?"done":current===number&&image?.status==="processing"?"active":"waiting";return <article className={`is-${state}`} key={name}><i>{state==="done"?<Check/>:number.toLocaleString("fa-IR")}</i><span><b lang="en" dir="ltr">{name}</b><small>{state==="done"?"آماده":state==="active"?image?.stage==="uploading"?"در حال انتشار":"در حال ساخت":"در انتظار"}</small></span></article>;})}</div>
  </div>;
}
