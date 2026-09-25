"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  LayoutGrid,
  RefreshCw,
  Shapes,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "react-toastify";
import { heroById, heroImage } from "@/data/heroes";
import { getPlayerSyncStatus, syncPlayerMatches } from "@/lib/api";
import { faNumber, formatDayDate, formatWeekday, parseDateKey, toJournalDateKey } from "@/lib/date";
import {
  buildPersianCalendarMonth,
  PERSIAN_WEEKDAYS,
  selectedWeekRange,
} from "@/lib/persian-calendar";
import type {
  ImageQueueJob,
  ManualSyncResult,
  MatchSyncGameMode,
  MatchSyncRequest,
  MatchSyncScope,
  PlayerSyncStatus,
} from "@/lib/types";
import { GameIcon } from "./GameIcon";

const faDateTime = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const ALL_SYNC_GAME_MODES: MatchSyncGameMode[] = ["ranked", "turbo", "all_pick", "captains", "other"];
const SYNC_GAME_MODE_OPTIONS: Array<{
  value: MatchSyncGameMode;
  label: string;
  icon: typeof Trophy;
}> = [
  { value: "ranked", label: "Ranked", icon: Trophy },
  { value: "turbo", label: "Turbo", icon: Zap },
  { value: "all_pick", label: "All Pick", icon: LayoutGrid },
  { value: "captains", label: "Captains", icon: Crown },
  { value: "other", label: "Other", icon: Shapes },
];

function formatTime(value: string | null) {
  return value ? faDateTime.format(new Date(value)) : "هنوز انجام نشده";
}

function queueLabel(job: ImageQueueJob) {
  return `نوبت ${faNumber.format(job.position || 1)} در صف`;
}

function dateLabel(key: string) {
  const date = parseDateKey(key);
  return `${formatWeekday(date)} ${formatDayDate(date)}`;
}

interface SyncPanelProps {
  registrationDate: string;
  weekLabel: string;
  weekRangeLabel: string;
  canGoPreviousWeek: boolean;
  canGoNextWeek: boolean;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  onReport: () => void;
  onMatchesImported: (result: ManualSyncResult) => void;
  previewMode?: boolean;
}

export default function SyncPanel({
  registrationDate,
  weekLabel,
  weekRangeLabel,
  canGoPreviousWeek,
  canGoNextWeek,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek,
  onReport,
  onMatchesImported,
  previewMode = false,
}: SyncPanelProps) {
  const [status, setStatus] = useState<PlayerSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [scope, setScope] = useState<MatchSyncScope>("day");
  const [gameModes, setGameModes] = useState<MatchSyncGameMode[]>(ALL_SYNC_GAME_MODES);
  const [selectedDay, setSelectedDay] = useState(() => toJournalDateKey(new Date()));
  const [calendarCursor, setCalendarCursor] = useState(() => toJournalDateKey(new Date()));
  const pickerRootRef = useRef<HTMLDivElement>(null);
  const today = toJournalDateKey(new Date());
  const calendar = useMemo(
    () => buildPersianCalendarMonth(calendarCursor),
    [calendarCursor],
  );
  const registrationMonth = useMemo(
    () => buildPersianCalendarMonth(registrationDate),
    [registrationDate],
  );
  const currentMonth = useMemo(() => buildPersianCalendarMonth(today), [today]);
  const weekRange = useMemo(
    () => selectedWeekRange(selectedDay, registrationDate, today),
    [registrationDate, selectedDay, today],
  );

  useEffect(() => {
    if (selectedDay < registrationDate || selectedDay > today) {
      setSelectedDay(today < registrationDate ? "" : today);
      setCalendarCursor(today);
    }
  }, [registrationDate, selectedDay, today]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!pickerRootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const loadStatus = useCallback(async (notify = false) => {
    if (previewMode) return;
    try {
      setStatus(await getPlayerSyncStatus());
    } catch (reason) {
      if (notify) {
        toast.error(reason instanceof Error ? reason.message : "وضعیت مچ‌ها دریافت نشد");
      }
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;
    void loadStatus(true);
  }, [loadStatus, previewMode]);

  useEffect(() => {
    if (previewMode) return;
    const active = Boolean(
      status?.imageQueue.jobs.some(
        (job) => job.kind === "analysis" && (job.status === "pending" || job.status === "processing"),
      ),
    );
    const timer = window.setInterval(() => void loadStatus(), active ? 3_000 : 15_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, previewMode, status]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const cooldownSeconds = status?.nextAllowedAt
    ? Math.max(0, Math.ceil((new Date(status.nextAllowedAt).getTime() - now) / 1_000))
    : 0;
  const visibleJobs = useMemo(
    () => status?.imageQueue.jobs
      .filter(
        (job) => job.kind === "analysis" && (job.status === "pending" || job.status === "processing"),
      )
      .sort(
        (left, right) =>
          (left.position || Number.MAX_SAFE_INTEGER) -
          (right.position || Number.MAX_SAFE_INTEGER),
      ) || [],
    [status],
  );
  const request: MatchSyncRequest = scope === "day"
    ? { scope, from: selectedDay, to: selectedDay, mode: "basic", gameModes }
    : { scope, from: weekRange.from, to: weekRange.to, mode: "basic", gameModes };
  const selectionDisabled = !gameModes.length || !selectedDay || request.from > request.to;

  function toggleGameMode(value: MatchSyncGameMode) {
    setGameModes((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  async function handleSync() {
    setSyncing(true);
    if (previewMode) {
      toast.success("این دریافت فقط در حالت پیش‌نمایش شبیه‌سازی شد.");
      setOpen(false);
      setStep(1);
      setSyncing(false);
      return;
    }
    try {
      const result = await syncPlayerMatches(request);
      onMatchesImported(result);
      const messages: string[] = [
        result.imported.length
          ? `${faNumber.format(result.imported.length)} مچ تازه اضافه شد.`
          : "مچ تازه‌ای پیدا نشد.",
      ];
      if (result.deferred) {
        messages.push(`${faNumber.format(result.deferred)} مچ به‌دلیل سقف هر دریافت باقی ماند.`);
      }
      toast.success(messages.join(" "));
      setOpen(false);
      setStep(1);
      await loadStatus();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "مچ‌ها دریافت نشدند");
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className={`sync-panel${open ? " is-picker-open" : ""}`} aria-labelledby="sync-panel-title">
      <div className="sync-panel-copy">
        <p className="week-kicker"><span aria-hidden="true" />{weekLabel}</p>
        <h2 id="sync-panel-title">{weekRangeLabel}</h2>
        <div className="week-navigation sync-week-navigation" aria-label="پیمایش هفته‌ها">
          <button className="nav-button" type="button" disabled={!canGoPreviousWeek} onClick={onPreviousWeek}>
            <ChevronRight aria-hidden="true" /> هفته قبل
          </button>
          <button className="today-button" type="button" onClick={onCurrentWeek}>هفته جاری</button>
          <button className="nav-button" type="button" disabled={!canGoNextWeek} onClick={onNextWeek}>
            هفته بعد <ChevronLeft aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="sync-panel-action" ref={pickerRootRef}>
        <button
          className="sync-button"
          type="button"
          disabled={syncing || cooldownSeconds > 0}
          onClick={() => setOpen((value) => {
            if (!value) setStep(1);
            return !value;
          })}
        >
          <span>
            {syncing
              ? "در حال دریافت"
              : cooldownSeconds
                ? `${faNumber.format(cooldownSeconds)} ثانیه تا دریافت بعدی`
                : "انتخاب بازه زمانی و دریافت اطلاعات"}
          </span>
          {syncing ? <RefreshCw className="is-spinning" /> : <ChevronDown className={open ? "is-open" : ""} />}
        </button>
        <button className="report-button sync-report-button" type="button" onClick={onReport}>
          <GameIcon name="report" /> گزارش هفته
        </button>

        {open && (
          <div className="sync-picker sync-wizard" role="dialog" aria-label="انتخاب و دریافت مچ">
            <header className="sync-wizard-header">
              <div className="sync-wizard-title"><CalendarDays /><strong>دریافت اطلاعات مچ</strong></div>
              <ol aria-label="مراحل دریافت">
                {[{ number: 1, label: "Game Mode" }, { number: 2, label: "بازه زمانی" }].map((item) => (
                  <li className={`${step === item.number ? "is-active" : ""}${step > item.number ? " is-complete" : ""}`} key={item.number}>
                    <b lang="en">{item.number}</b><span>{item.label}</span>
                  </li>
                ))}
              </ol>
            </header>

            <div className="sync-wizard-body">
              {step === 1 && (
                <section className="sync-game-mode-step" aria-labelledby="sync-game-mode-title">
                  <div className="sync-step-copy"><small lang="en">STEP 01</small><strong id="sync-game-mode-title">کدام Game Modeها دریافت شوند؟</strong></div>
                  <div className="sync-game-mode-options">
                    {SYNC_GAME_MODE_OPTIONS.map((option) => {
                      const selected = gameModes.includes(option.value);
                      const Icon = option.icon;
                      return (
                        <button className={selected ? "is-active" : ""} type="button" aria-pressed={selected} onClick={() => toggleGameMode(option.value)} key={option.value}>
                          <Icon /><span><b lang="en">{option.label}</b></span><i>{selected && <Check />}</i>
                        </button>
                      );
                    })}
                  </div>
                  {!gameModes.length && <p className="sync-selection-error">حداقل یک Game Mode را انتخاب کن.</p>}
                </section>
              )}

              {step === 2 && (
                <section className="sync-calendar-step" aria-label="انتخاب روز یا هفته">
                  <header className="sync-calendar-header">
                    <div className="sync-calendar-persian-title"><CalendarDays /><strong>{calendar.persianTitle}</strong></div>
                    <div className="sync-scope-switch" aria-label="نوع بازه">
                      <button className={scope === "day" ? "is-active" : ""} type="button" onClick={() => setScope("day")}>یک روز</button>
                      <button className={scope === "week" ? "is-active" : ""} type="button" onClick={() => setScope("week")}>کل هفته</button>
                    </div>
                    <span className="sync-calendar-gregorian-title" lang="en" dir="ltr">{calendar.gregorianTitle}</span>
                  </header>
                  <div className="sync-calendar-toolbar">
                    <nav className="sync-calendar-month-nav" aria-label="جابجایی ماه تقویم">
                      <button type="button" disabled={calendar.firstKey >= currentMonth.firstKey} onClick={() => setCalendarCursor(calendar.nextCursor)}>ماه بعد<ChevronLeft /></button>
                      <button type="button" disabled={calendar.firstKey <= registrationMonth.firstKey} onClick={() => setCalendarCursor(calendar.previousCursor)}><ChevronRight />ماه قبل</button>
                    </nav>
                  </div>
                  <div className="sync-calendar-weekdays" aria-hidden="true">{PERSIAN_WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
                  <div className="sync-day-grid">
                    {Array.from({ length: calendar.leadingBlankDays }, (_, index) => <span className="sync-calendar-empty" key={`empty-${index}`} aria-hidden="true" />)}
                    {calendar.days.map((day) => {
                      const disabled = day.key < registrationDate || day.key > today;
                      const inSelectedWeek = scope === "week" && day.key >= weekRange.from && day.key <= weekRange.to;
                      const selectedDate = scope === "day" && selectedDay === day.key;
                      return (
                        <button className={`${selectedDate ? "is-active " : ""}${inSelectedWeek ? "is-in-week " : ""}${day.key === today ? "is-today " : ""}${disabled ? "is-disabled" : ""}`} type="button" key={day.key} disabled={disabled} onClick={() => setSelectedDay(day.key)} aria-label={`${dateLabel(day.key)}، ${day.gregorianDay} ${day.gregorianMonth}`} aria-current={day.key === today ? "date" : undefined}>
                          <strong>{faNumber.format(day.persianDay)}</strong><small lang="en" dir="ltr"><span>{day.gregorianDay}</span><em>{day.gregorianMonth}</em></small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

            </div>

            <nav className="sync-wizard-navigation" aria-label="جابجایی مراحل">
              <button type="button" disabled={step === 1} onClick={() => setStep(1)}><ChevronRight /> مرحله قبل</button>
              <span lang="en" dir="ltr">{step} / 2</span>
              <button type="button" disabled={step === 2 || !gameModes.length} onClick={() => setStep(2)}>مرحله بعد <ChevronLeft /></button>
            </nav>

            <footer className="sync-wizard-footer">
              <span>{step === 1 ? `${gameModes.length.toLocaleString("fa-IR")} حالت انتخاب شده` : scope === "day" ? (selectedDay ? dateLabel(selectedDay) : "روز قابل دریافت نیست") : `هفتهٔ ${dateLabel(weekRange.from)} تا ${dateLabel(weekRange.to)}`}</span>
              {step === 2 && <button className="primary-button" type="button" disabled={selectionDisabled} onClick={() => void handleSync()}>دریافت ساده</button>}
            </footer>
          </div>
        )}
      </div>

      {visibleJobs.length > 0 && (
        <div className="image-queue is-compact" aria-label="صف تحلیل مچ‌ها" aria-live="polite">
          <div className="image-queue-list">
            {visibleJobs.map((job) => {
              const hero = job.heroId ? heroById(job.heroId) : undefined;
              return (
                <article className={`queue-job is-${job.status}`} key={job.id}>
                  <span className="queue-job-portrait">{hero ? <img src={heroImage(hero)} alt="" /> : <span>?</span>}</span>
                  <div className="queue-job-copy"><strong lang="en" dir="ltr">Match {job.dotaMatchId || "—"}</strong></div>
                  <span className="queue-job-position">{queueLabel(job)}</span>
                </article>
              );
            })}
          </div>
        </div>
      )}

    </section>
  );
}
