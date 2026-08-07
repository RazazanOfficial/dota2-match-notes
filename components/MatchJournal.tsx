"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { heroById, heroImage } from "@/data/heroes";
import {
  loginPlayer,
  logout,
  purgeLegacyBrowserCache,
  restorePlayer,
  saveDay,
  viewCoach,
  viewPlayer,
} from "@/lib/api";
import { ANCHOR_DATE, queueLabel, roleLabel } from "@/lib/constants";
import {
  faNumber,
  faPercent,
  formatDayDate,
  formatFullDate,
  formatWeekRange,
  formatWeekday,
  getCurrentWeekIndex,
  getWeekDates,
  getWeekLabel,
  isValidUsername,
  mergeProfiles,
  normalizePublicHandle,
  summarizeMatches,
  summarizeWeek,
  toDateKey,
} from "@/lib/date";
import type { Day, Match, Profile, Session } from "@/lib/types";
import MatchDialog from "./MatchDialog";
import ReportDialog from "./ReportDialog";

type AccessView = "roles" | "coach";

const EMPTY_PROFILE: Profile = { username: "", days: {} };

export default function MatchJournal() {
  const [loading, setLoading] = useState(true);
  const [accessView, setAccessView] = useState<AccessView>("roles");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [activeWeek, setActiveWeek] = useState(() => getCurrentWeekIndex(ANCHOR_DATE));
  const [syncState, setSyncState] = useState<"synced" | "syncing" | "error">("synced");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState<{ dateKey: string; matchId: string | null } | null>(
    null,
  );
  const toastTimer = useRef<number | null>(null);
  const dates = useMemo(() => getWeekDates(ANCHOR_DATE, activeWeek), [activeWeek]);
  const rangeFrom = toDateKey(dates[0]);
  const rangeTo = toDateKey(dates[dates.length - 1]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        await purgeLegacyBrowserCache();
        const restored = await restorePlayer();
        if (!cancelled && restored) setSession(restored);
      } catch {
        if (!cancelled) setSyncState("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session || editing) return;

    const activeSession = session;
    let cancelled = false;
    async function refresh() {
      try {
        const latest =
          activeSession.mode === "player"
            ? await viewPlayer(activeSession.username, rangeFrom, rangeTo)
            : await viewCoach(activeSession.username, rangeFrom, rangeTo);
        if (cancelled) return;
        setProfile((current) =>
          current.username && current.username !== latest.username
            ? latest
            : mergeProfiles(current, latest),
        );
        setSyncState("synced");
      } catch {
        if (!cancelled) setSyncState("error");
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [editing, rangeFrom, rangeTo, session]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }

  function handlePlayerLogin() {
    setBusy(true);
    loginPlayer();
  }

  async function handleCoachLogin(usernameValue: string) {
    const username = normalizePublicHandle(usernameValue);
    if (!isValidUsername(username)) {
      throw new Error(
        "نام کاربری باید ۳ تا ۳۲ نویسه و شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد",
      );
    }
    setBusy(true);
    try {
      const nextProfile = await viewCoach(username, rangeFrom, rangeTo);
      setSession({ mode: "coach", username });
      setProfile(nextProfile);
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await logout(session);
    } finally {
      setSession(null);
      setProfile(EMPTY_PROFILE);
      setAccessView("roles");
      setEditing(null);
      setBusy(false);
    }
  }

  const weekSummary = useMemo(
    () => summarizeWeek(profile.days, dates),
    [dates, profile.days],
  );
  const editedDay = editing
    ? profile.days[editing.dateKey] || { completed: false, matches: [] }
    : null;
  const editedMatch =
    editing?.matchId && editedDay
      ? editedDay.matches.find((match) => match.id === editing.matchId) || null
      : null;

  async function mutateDay(dateKey: string, mutate: (day: Day) => Day) {
    if (!session || session.mode !== "player") return false;
    const previous = profile;
    const baseDay = profile.days[dateKey] || { completed: false, matches: [] };
    const nextDay = mutate(structuredClone(baseDay));
    const optimistic = {
      ...profile,
      days: { ...profile.days, [dateKey]: nextDay },
    };
    setProfile(optimistic);
    setSyncState("syncing");
    try {
      const saved = await saveDay(session, dateKey, nextDay);
      setProfile((current) => mergeProfiles(current, saved));
      setSyncState("synced");
      return true;
    } catch (error) {
      setProfile(previous);
      setSyncState("error");
      showToast(error instanceof Error ? error.message : "ثبت اطلاعات انجام نشد");
      return false;
    }
  }

  async function handleSaveMatch(match: Match) {
    if (!editing) return;
    setBusy(true);
    const saved = await mutateDay(editing.dateKey, (day) => {
      const index = day.matches.findIndex((item) => item.id === match.id);
      if (index >= 0) day.matches[index] = match;
      else day.matches.push(match);
      day.completed = false;
      return day;
    });
    setBusy(false);
    if (saved) {
      setEditing(null);
      showToast(editedMatch ? "بازی ویرایش شد" : "بازی ثبت شد");
    }
  }

  async function handleDeleteMatch(matchId: string) {
    if (!editing || !window.confirm("این بازی حذف شود؟")) return;
    setBusy(true);
    const saved = await mutateDay(editing.dateKey, (day) => ({
      ...day,
      completed: false,
      matches: day.matches.filter((match) => match.id !== matchId),
    }));
    setBusy(false);
    if (saved) {
      setEditing(null);
      showToast("بازی حذف شد");
    }
  }

  async function toggleDay(dateKey: string) {
    const day = profile.days[dateKey] || { completed: false, matches: [] };
    if (!day.matches.length && !day.completed) {
      showToast("بازی‌ای برای این روز ثبت نشده");
      return;
    }
    const completed = !day.completed;
    const saved = await mutateDay(dateKey, (current) => ({ ...current, completed }));
    if (saved && completed) {
      const summary = summarizeMatches(day.matches);
      showToast(`${faNumber.format(summary.wins)} برد و ${faNumber.format(summary.losses)} باخت`);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="loading-mark" lang="en">D2</span>
        <span className="loading-line" />
      </main>
    );
  }

  if (!session) {
    return (
      <AccessScreen
        view={accessView}
        busy={busy}
        onViewChange={setAccessView}
        onPlayerLogin={handlePlayerLogin}
        onCoachLogin={handleCoachLogin}
      />
    );
  }

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <Brand />
          <div className="account-summary">
            <div className="account-copy">
              <span className={`mode-badge${session.mode === "coach" ? " is-coach" : ""}`}>
                {session.mode === "player" ? "بازیکن" : "مربی"}
              </span>
              <strong lang="en" dir="ltr">{session.username}</strong>
            </div>
            <span className={`sync-status is-${syncState}`}>
              <span className="status-dot" />
              {syncState === "syncing" ? "در حال ثبت" : syncState === "error" ? "خطا" : "همگام"}
            </span>
            <button className="secondary-button" type="button" disabled={busy} onClick={leave}>
              خروج
            </button>
          </div>
        </header>

        <main>
          <section className="week-overview">
            <div className="week-heading">
              <div>
                <p className="week-kicker">{getWeekLabel(activeWeek)}</p>
                <h2>{formatWeekRange(dates)}</h2>
              </div>
              <div className="week-navigation" aria-label="پیمایش هفته‌ها">
                <button
                  className="nav-button"
                  type="button"
                  disabled={activeWeek === 0}
                  onClick={() => setActiveWeek((week) => Math.max(0, week - 1))}
                >
                  → هفته قبل
                </button>
                <button
                  className="today-button"
                  type="button"
                  onClick={() => setActiveWeek(getCurrentWeekIndex(ANCHOR_DATE))}
                >
                  هفته جاری
                </button>
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => setActiveWeek((week) => week + 1)}
                >
                  هفته بعد ←
                </button>
              </div>
            </div>
            <div className="week-stats">
              <Stat label="کل بازی‌ها" value={faNumber.format(weekSummary.games)} />
              <Stat label="برد" value={faNumber.format(weekSummary.wins)} tone="win" />
              <Stat label="باخت" value={faNumber.format(weekSummary.losses)} tone="loss" />
              <Stat label="نرخ برد" value={faPercent.format(weekSummary.winRate)} />
              <button className="report-button" type="button" onClick={() => setReportOpen(true)}>
                گزارش هفته
              </button>
            </div>
          </section>

          <section className="calendar" aria-label="تقویم هفتگی">
            {dates.map((date) => {
              const dateKey = toDateKey(date);
              const day = profile.days[dateKey] || { completed: false, matches: [] };
              const summary = summarizeMatches(day.matches);
              const today = toDateKey(new Date()) === dateKey;
              return (
                <article
                  className={`day-card${today ? " is-today" : ""}${day.completed ? " is-complete" : ""}`}
                  key={dateKey}
                >
                  <header className="day-header">
                    <div>
                      <p className="day-name">
                        {formatWeekday(date)}
                        {today && <span className="today-badge">امروز</span>}
                      </p>
                      <h3 className="day-date">{formatDayDate(date)}</h3>
                    </div>
                    {session.mode === "player" && (
                      <button
                        className="add-match-button"
                        type="button"
                        aria-label="افزودن بازی"
                        onClick={() => setEditing({ dateKey, matchId: null })}
                      >
                        +
                      </button>
                    )}
                  </header>
                  <div className="matches">
                    {day.matches.length ? (
                      day.matches
                        .slice()
                        .sort((a, b) => a.number - b.number)
                        .map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            onClick={() => setEditing({ dateKey, matchId: match.id })}
                          />
                        ))
                    ) : (
                      <div className="empty-day">بدون بازی ثبت‌شده</div>
                    )}
                  </div>
                  <footer className="day-summary">
                    <div className="day-stat"><span>برد</span><strong>{faNumber.format(summary.wins)}</strong></div>
                    <div className="day-stat"><span>باخت</span><strong>{faNumber.format(summary.losses)}</strong></div>
                    {session.mode === "player" ? (
                      <button className="day-complete-button" type="button" onClick={() => toggleDay(dateKey)}>
                        {day.completed ? "روز تکمیل شد" : "اتمام روز"}
                      </button>
                    ) : (
                      <span className="day-complete-readonly">
                        {day.completed ? "روز تکمیل شد" : "روز باز"}
                      </span>
                    )}
                  </footer>
                </article>
              );
            })}
          </section>
        </main>
      </div>

      <MatchDialog
        open={Boolean(editing)}
        readonly={session.mode === "coach"}
        dateLabel={editing ? formatFullDate(new Date(`${editing.dateKey}T00:00:00Z`)) : ""}
        match={editedMatch}
        nextNumber={
          editedDay ? editedDay.matches.reduce((max, match) => Math.max(max, match.number), 0) + 1 : 1
        }
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={handleSaveMatch}
        onDelete={handleDeleteMatch}
      />
      <ReportDialog
        open={reportOpen}
        profile={profile}
        anchorDate={ANCHOR_DATE}
        weekIndex={activeWeek}
        onClose={() => setReportOpen(false)}
        onToast={showToast}
      />
      <div className={`toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" lang="en">D2</span>
      <div>
        <p className="eyebrow" lang="en">MATCH JOURNAL</p>
        <h1>دفتر مچ‌های دوتا ۲</h1>
      </div>
    </div>
  );
}

function AccessScreen({
  view,
  busy,
  onViewChange,
  onPlayerLogin,
  onCoachLogin,
}: {
  view: AccessView;
  busy: boolean;
  onViewChange: (view: AccessView) => void;
  onPlayerLogin: () => void;
  onCoachLogin: (username: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (view === "coach") await onCoachLogin(username);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ورود انجام نشد");
    }
  }

  return (
    <main className="access-screen">
      <header className="access-brand"><Brand /></header>
      <section className="access-panel">
        <div className="access-heading">
          <p className="week-kicker">{view === "roles" ? "دسترسی" : "مربی"}</p>
          <h2>{view === "roles" ? "نوع ورود را انتخاب کنید" : "مشاهده گزارش بازیکن"}</h2>
        </div>
        {view === "roles" ? (
          <div className="role-grid">
            <button className="role-card role-player" type="button" onClick={onPlayerLogin}>
              <span className="role-icon">✦</span><span className="role-name">بازیکن</span>
              <span className="role-description">ثبت و مدیریت بازی‌ها</span>
            </button>
            <button className="role-card role-coach" type="button" onClick={() => onViewChange("coach")}>
              <span className="role-icon">◎</span><span className="role-name">مربی</span>
              <span className="role-description">مشاهده گزارش بازیکن</span>
            </button>
          </div>
        ) : (
          <form className="access-form" onSubmit={submit}>
            <label className="field">
              <span>نام کاربری بازیکن</span>
              <input
                lang="en"
                dir="ltr"
                autoComplete="off"
                value={username}
                maxLength={32}
                required
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <p className="form-error" role="alert">{error}</p>
            <div className="access-actions">
              <button className="secondary-button" type="button" onClick={() => onViewChange("roles")}>
                بازگشت
              </button>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "در حال اتصال" : "مشاهده"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <article className={`stat-card${tone ? ` stat-${tone}` : ""}`}>
      <span>{label}</span><strong>{value}</strong>
    </article>
  );
}

function MatchCard({ match, onClick }: { match: Match; onClick: () => void }) {
  const hero = match.heroId ? heroById(match.heroId) : null;
  return (
    <button className={`match-card is-${match.result}`} type="button" onClick={onClick}>
      <div className="match-topline">
        <span className="match-number">بازی {faNumber.format(match.number)}</span>
        <span className={`result-badge is-${match.result}`}>
          {match.result === "win" ? "برد" : "باخت"}
        </span>
      </div>
      <div className="match-hero-row">
        {hero && <img src={heroImage(hero)} alt="" />}
        <div>
          <h4 className="match-hero" lang="en">{match.heroName || "بدون هیرو"}</h4>
          <span className="match-meta" lang="en">
            {roleLabel(match.role)} · {queueLabel(match.queueType)}
          </span>
        </div>
      </div>
      {(match.bans.length > 0 || match.legacyBans) && (
        <p className="match-bans">
          بن‌ها: {match.bans.map((ban) => ban.name).join("، ") || match.legacyBans}
        </p>
      )}
      {match.notes && <p className="match-notes">{match.notes}</p>}
    </button>
  );
}
