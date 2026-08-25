"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Copy,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Share2,
  Shield,
  UserRound,
} from "lucide-react";
import { toast } from "react-toastify";
import { heroById, heroImage } from "@/data/heroes";
import {
  getHeroPool,
  logout,
  purgeLegacyBrowserCache,
  restorePlayer,
  saveDay,
  updateHeroPool,
  viewCoach,
  viewPlayer,
} from "@/lib/api";
import { queueLabel, roleLabel } from "@/lib/constants";
import {
  faNumber,
  faPercent,
  formatDayDate,
  formatFullDate,
  formatWeekRange,
  formatWeekday,
  getCurrentWeekIndex,
  getWeekAnchorDate,
  getWeekDates,
  getWeekLabel,
  isValidPublicPlayerIdentifier,
  mergeProfiles,
  normalizePublicPlayerIdentifier,
  summarizeMatches,
  summarizeWeek,
  toDateKey,
} from "@/lib/date";
import type { Day, HeroPoolData, Match, Profile, Session } from "@/lib/types";
import MatchDialog from "./MatchDialog";
import ReportDialog from "./ReportDialog";
import SyncPanel from "./SyncPanel";
import AppLogo from "./AppLogo";
import { GameIcon } from "./GameIcon";
import HeroPoolDialog from "./HeroPoolDialog";
import ReleaseNotes from "./ReleaseNotes";
import AccountSettingsDialog from "./AccountSettingsDialog";
import LoginDialog from "./LoginDialog";
import PlayerSearchDialog from "./PlayerSearchDialog";

type AccessView = "roles" | "coach";

const EMPTY_PROFILE: Profile = { username: "", days: {} };

function sessionMatchesIdentifier(session: Session, identifier: string) {
  const normalized = identifier.normalize("NFKC").trim().toLowerCase();
  return (
    normalized === session.username.toLowerCase() ||
    normalized === String(session.steamAccountId || "") ||
    normalized === String(session.steamId || "")
  );
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("کپی لینک انجام نشد");
}

export default function MatchJournal({
  initialPublicIdentifier,
}: {
  initialPublicIdentifier?: string;
} = {}) {
  const router = useRouter();
  const initialIdentifier = initialPublicIdentifier
    ? normalizePublicPlayerIdentifier(initialPublicIdentifier)
    : null;
  const [loading, setLoading] = useState(true);
  const [accessView, setAccessView] = useState<AccessView>("roles");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [activeWeek, setActiveWeek] = useState(0);
  const [syncState, setSyncState] = useState<"synced" | "syncing" | "error">("synced");
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [viewingHandle, setViewingHandle] = useState<string | null>(initialIdentifier);
  const [reportOpen, setReportOpen] = useState(false);
  const [heroPoolOpen, setHeroPoolOpen] = useState(false);
  const [heroPool, setHeroPool] = useState<HeroPoolData | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [editing, setEditing] = useState<{ dateKey: string; matchId: string | null } | null>(
    null,
  );
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const membershipDate = viewingHandle
    ? profile.registeredDate || profile.createdAt
    : session?.registeredDate || profile.registeredDate || session?.createdAt || profile.createdAt;
  const anchorDate = useMemo(
    () => getWeekAnchorDate(membershipDate || toDateKey(new Date())),
    [membershipDate],
  );
  const registrationDate = membershipDate?.slice(0, 10) || toDateKey(new Date());
  const canEdit = session?.mode === "player" && !viewingHandle;
  const dates = useMemo(() => getWeekDates(anchorDate, activeWeek), [activeWeek, anchorDate]);
  const rangeFrom = toDateKey(dates[0]);
  const rangeTo = toDateKey(dates[dates.length - 1]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        await purgeLegacyBrowserCache();
        const restored = await restorePlayer();
        if (cancelled) return;

        if (initialIdentifier) {
          if (restored && sessionMatchesIdentifier(restored, initialIdentifier)) {
            setSession(restored);
            setViewingHandle(null);
          } else {
            setSession(restored || { mode: "coach", username: initialIdentifier });
            setViewingHandle(initialIdentifier);
          }
        } else if (restored) {
          setSession(restored);
        }
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
  }, [initialIdentifier]);

  useEffect(() => {
    setActiveWeek(getCurrentWeekIndex(anchorDate));
  }, [anchorDate, session?.username, viewingHandle]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (session?.mode !== "player") return;
    let cancelled = false;
    getHeroPool()
      .then((pool) => { if (!cancelled) setHeroPool(pool); })
      .catch(() => { if (!cancelled) setSyncState("error"); });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (!session || editing) return;

    const activeSession = session;
    let cancelled = false;
    async function refresh() {
      try {
        const targetHandle = viewingHandle || activeSession.username;
        const latest =
          activeSession.mode === "player" && !viewingHandle
            ? await viewPlayer(activeSession.username, rangeFrom, rangeTo)
            : await viewCoach(targetHandle, rangeFrom, rangeTo);
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
  }, [editing, rangeFrom, rangeTo, session, refreshVersion, viewingHandle]);

  function showToast(message: string) {
    toast.success(message);
  }

  async function handleAuthenticated() {
    const restored = await restorePlayer();
    if (!restored) throw new Error("ورود کامل نشد؛ دوباره تلاش کنید");
    setSession(restored);
    setViewingHandle(
      initialIdentifier && !sessionMatchesIdentifier(restored, initialIdentifier)
        ? initialIdentifier
        : null,
    );
    setProfile(EMPTY_PROFILE);
    setRefreshVersion((version) => version + 1);
  }

  async function handleCoachLogin(usernameValue: string) {
    const identifier = normalizePublicPlayerIdentifier(usernameValue);
    if (!isValidPublicPlayerIdentifier(identifier)) {
      throw new Error("نام یا شناسه بازیکن معتبر نیست");
    }
    setBusy(true);
    router.push(`/user/${encodeURIComponent(identifier)}`);
  }

  function returnToMyJournal() {
    router.push("/me");
  }

  async function copyPublicProfileLink() {
    const identifier = viewingHandle ||
      (session?.mode === "player" ? session.steamAccountId || session.username : profile.username);
    if (!identifier) return;

    try {
      await copyText(`${window.location.origin}/user/${encodeURIComponent(String(identifier))}`);
      toast.success("لینک پروفایل کپی شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "کپی لینک انجام نشد");
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await logout(session);
    } finally {
      if (initialIdentifier) {
        setSession({ mode: "coach", username: initialIdentifier });
        setViewingHandle(initialIdentifier);
      } else {
        setSession(null);
        setViewingHandle(null);
      }
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
    if (!session || !canEdit) return false;
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
      toast.error(error instanceof Error ? error.message : "ثبت اطلاعات انجام نشد");
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
    if (!editing) return;
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
      toast.info("بازی‌ای برای این روز ثبت نشده");
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
        <span className="loading-mark">
          <AppLogo size={70} alt="" priority />
        </span>
        <span className="loading-line" />
      </main>
    );
  }

  if (!session) {
    return (
      <>
        <AccessScreen
          view={accessView}
          busy={busy}
          onViewChange={setAccessView}
          onPlayerLogin={() => setLoginOpen(true)}
          onCoachLogin={handleCoachLogin}
        />
        <LoginDialog
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <Brand />
          <div className="header-actions">
            <ReleaseNotes authenticated={session.mode === "player"} compact />
            {canEdit && (
              <button className="hero-pool-header-button" type="button" onClick={() => setHeroPoolOpen(true)}>
                <Shield aria-hidden="true" /><span>Hero Pool</span>
              </button>
            )}
            <button className="header-icon-button" type="button" onClick={() => setPlayerSearchOpen(true)} aria-label="جست‌وجوی بازیکن">
              <Search aria-hidden="true" />
            </button>
            <button className="header-icon-button" type="button" onClick={copyPublicProfileLink} aria-label="کپی لینک پروفایل">
              <Share2 aria-hidden="true" />
            </button>
            {session.mode === "player" ? <div className="account-menu" ref={accountMenuRef}>
              <button
                className={`account-menu-trigger sync-${syncState}`}
                type="button"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((current) => !current)}
              >
                <span className="steam-avatar-diamond">
                  {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : <UserRound aria-hidden="true" />}
                </span>
                <span className="account-menu-name"><strong>{session.displayName || session.username}</strong></span>
                <Menu className="account-menu-glyph" aria-hidden="true" />
                <ChevronDown className={accountMenuOpen ? "is-open" : ""} aria-hidden="true" />
              </button>
              {accountMenuOpen && (
                <div className="account-menu-popover" role="menu">
                  {session.mode === "player" && (
                    <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); setAccountSettingsOpen(true); }}>
                      <Settings aria-hidden="true" /> تنظیمات حساب
                    </button>
                  )}
                  {session.mode === "player" && session.isSuperAdmin && (
                    <a href="/admin" role="menuitem"><Shield aria-hidden="true" /> مدیریت</a>
                  )}
                  <button type="button" role="menuitem" disabled={busy} onClick={leave}>
                    <LogOut aria-hidden="true" /> خروج
                  </button>
                </div>
              )}
            </div> : (
              <button className="primary-button public-profile-login" type="button" onClick={() => setLoginOpen(true)}>
                ورود
              </button>
            )}
          </div>
        </header>

        {viewingHandle && (
          <div className="public-view-banner">
            <span>در حال دیدن دفتر <b lang="en" dir="ltr">{profile.username}</b></span>
            {session.mode === "player" ? (
              <button type="button" onClick={returnToMyJournal}><RotateCcw aria-hidden="true" /> بازگشت به دفتر من</button>
            ) : (
              <button type="button" onClick={copyPublicProfileLink}><Copy aria-hidden="true" /> کپی لینک پروفایل</button>
            )}
          </div>
        )}

        <main>
          {canEdit && (
            <SyncPanel
              onMatchesImported={(result) => {
                const enriched = result.stratz?.jobs.some(
                  (job) => job.status === "completed",
                );
                if (result.imported.length || enriched) {
                  setActiveWeek(getCurrentWeekIndex(anchorDate));
                  setRefreshVersion((version) => version + 1);
                }
              }}
            />
          )}
          <section className="week-overview">
            <div className="week-heading">
              <div>
                <p className="week-kicker"><span aria-hidden="true" />{getWeekLabel(activeWeek)}</p>
                <h2>{formatWeekRange(dates)}</h2>
                <p className="week-subtitle">هر مچ را ببین، الگوی بازیت را پیدا کن</p>
              </div>
              <div className="week-navigation" aria-label="پیمایش هفته‌ها">
                <button
                  className="nav-button"
                  type="button"
                  disabled={activeWeek === 0}
                  onClick={() => setActiveWeek((week) => Math.max(0, week - 1))}
                >
                  <ChevronRight aria-hidden="true" /> هفته قبل
                </button>
                <button
                  className="today-button"
                  type="button"
                  onClick={() => setActiveWeek(getCurrentWeekIndex(anchorDate))}
                >
                  هفته جاری
                </button>
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => setActiveWeek((week) => week + 1)}
                >
                  هفته بعد <ChevronLeft aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="week-stats">
              <Stat label="کل بازی‌ها" value={faNumber.format(weekSummary.games)} />
              <Stat label="برد" value={faNumber.format(weekSummary.wins)} tone="win" />
              <Stat label="باخت" value={faNumber.format(weekSummary.losses)} tone="loss" />
              <Stat label="نرخ برد" value={faPercent.format(weekSummary.winRate)} />
              <button className="report-button" type="button" onClick={() => setReportOpen(true)}>
                <GameIcon name="report" /> گزارش هفته
              </button>
            </div>
          </section>

          <section className="calendar" aria-label="تقویم هفتگی">
            {dates.map((date) => {
              const dateKey = toDateKey(date);
              const day = profile.days[dateKey] || { completed: false, matches: [] };
              const summary = summarizeMatches(day.matches);
              const today = toDateKey(new Date()) === dateKey;
              const disabled = activeWeek === 0 && dateKey < registrationDate;
              return (
                <article
                  className={`day-card${today ? " is-today" : ""}${day.completed ? " is-complete" : ""}${disabled ? " is-disabled" : ""}`}
                  key={dateKey}
                  aria-disabled={disabled}
                >
                  <header className="day-header">
                    <div>
                      <p className="day-name">
                        {formatWeekday(date)}
                        {today && <span className="today-badge">امروز</span>}
                      </p>
                      <h3 className="day-date">{formatDayDate(date)}</h3>
                    </div>
                    {canEdit && !disabled && (
                      <button
                        className="add-match-button"
                        type="button"
                        aria-label="افزودن بازی"
                        onClick={() => setEditing({ dateKey, matchId: null })}
                      >
                        <Plus aria-hidden="true" />
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
                            onClick={() => { if (!disabled) setEditing({ dateKey, matchId: match.id }); }}
                          />
                        ))
                    ) : (
                      <div className="empty-day">{disabled ? "پیش از شروع دفتر" : "هنوز مچی ثبت نشده"}</div>
                    )}
                  </div>
                  <footer className="day-summary">
                    <div className="day-stat"><span>برد</span><strong>{faNumber.format(summary.wins)}</strong></div>
                    <div className="day-stat"><span>باخت</span><strong>{faNumber.format(summary.losses)}</strong></div>
                    {canEdit && !disabled ? (
                      <button className="day-complete-button" type="button" onClick={() => toggleDay(dateKey)}>
                        {day.completed ? "روز جمع‌بندی شد" : "جمع‌بندی روز"}
                      </button>
                    ) : (
                      <span className="day-complete-readonly">
                        {disabled ? "پیش از عضویت" : day.completed ? "روز جمع‌بندی شد" : "هنوز جمع‌بندی نشده"}
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
        readonly={!canEdit}
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
        anchorDate={anchorDate}
        weekIndex={activeWeek}
        onClose={() => setReportOpen(false)}
        onToast={showToast}
      />
      <HeroPoolDialog
        open={heroPoolOpen}
        value={heroPool}
        busy={busy}
        onClose={() => setHeroPoolOpen(false)}
        onSave={async (pools) => {
          setBusy(true);
          try {
            setHeroPool(await updateHeroPool(pools));
            setHeroPoolOpen(false);
            showToast("Hero Pool ثبت شد");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "ثبت Hero Pool انجام نشد");
          } finally {
            setBusy(false);
          }
        }}
      />
      <AccountSettingsDialog
        open={accountSettingsOpen}
        hasPassword={Boolean(session.hasPassword)}
        onClose={() => setAccountSettingsOpen(false)}
        onPasswordStateChange={(hasPassword) =>
          setSession((current) => current ? { ...current, hasPassword } : current)
        }
      />
      <LoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={handleAuthenticated}
      />
      <PlayerSearchDialog
        open={playerSearchOpen}
        onClose={() => setPlayerSearchOpen(false)}
      />
    </>
  );
}

function Brand() {
  return (
    <div className="brand">
      <AppLogo size={64} priority />
      <div>
        <p className="eyebrow" lang="en">DOTA2 NOTES</p>
        <h1>دفتر مچ‌های من</h1>
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
      <header className="access-brand">
        <Brand />
        <div className="access-header-actions"><ReleaseNotes /><button className="primary-button" type="button" onClick={onPlayerLogin}>ورود</button></div>
      </header>
      <div className="access-stage">
        <section className="access-intro">
          <p className="access-overline" lang="en">TURN EVERY MATCH INTO PROGRESS</p>
          <h2>هر مچ، یک قدم به<br /><em>بازی بهتر.</em></h2>
          <p className="access-lead">
            مچ‌هایت را مرور کن، الگوهای بازیت را بشناس و تصمیم‌های بعدی را آگاهانه‌تر بگیر.
          </p>
          <div className="access-feature-list" aria-label="امکانات اصلی">
            <span><GameIcon name="journal" /> مرور مچ‌ها</span>
            <span><GameIcon name="report" /> Hero Pool شخصی</span>
            <span><GameIcon name="gold" /> گزارش پیشرفت</span>
          </div>
          <div className="access-runes" aria-hidden="true">
            <span>STR</span><span>AGI</span><span>INT</span>
          </div>
        </section>
        <section className="access-panel" id="login">
          <div className="access-heading">
            <p className="week-kicker"><span aria-hidden="true" />{view === "roles" ? "ورود به Dota2Notes" : "دفتر عمومی بازیکن"}</p>
            <h2>{view === "roles" ? "چطور می‌خواهی وارد شوی؟" : "دفتر کدام بازیکن را می‌خواهی ببینی؟"}</h2>
          </div>
          {view === "roles" ? (
            <div className="role-grid">
              <button className="role-card role-player" type="button" onClick={onPlayerLogin}>
                <span className="role-icon"><GameIcon name="player" /></span>
                <span className="role-card-index" lang="en">01</span>
                <span className="role-name">دفتر شخصی من</span>
                <span className="role-description">ثبت و مرور مچ‌های خودت</span>
                <span className="role-cta">ورود به حساب <ChevronLeft aria-hidden="true" /></span>
              </button>
              <button className="role-card role-coach" type="button" onClick={() => onViewChange("coach")}>
                <span className="role-icon"><GameIcon name="coach" /></span>
                <span className="role-card-index" lang="en">02</span>
                <span className="role-name">دفتر یک بازیکن</span>
                <span className="role-description">مرور پروفایل عمومی با شناسه Dota2Notes</span>
                <span className="role-cta">پیدا کردن بازیکن <ChevronLeft aria-hidden="true" /></span>
              </button>
            </div>
          ) : (
            <form className="access-form" onSubmit={submit}>
              <label className="field">
                <span>نام یا شناسه بازیکن</span>
                <input
                  lang="en"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="Steam name, Account ID یا SteamID64"
                  value={username}
                  maxLength={64}
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
                  {busy ? "در حال پیدا کردن" : "مشاهده دفتر"}
                </button>
              </div>
            </form>
          )}
          <footer className="access-panel-footer"><span lang="en">DOTA2NOTES · YOUR MATCH JOURNAL</span><span></span></footer>
        </section>
      </div>
      <section className="feature-chronicle" aria-label="ویژگی‌های Dota2 Notes">
        <header className="feature-chronicle-heading">
          <p lang="en">YOUR MATCHES. YOUR PATTERNS.</p>
          <h2>از نتیجه عبور کن؛<br /><em>دلیلش را پیدا کن.</em></h2>
        </header>
        <article className="feature-story">
          <div className="feature-story-copy"><span lang="en">01 · ROLE MASTERY</span><h3>هیروهایی که واقعاً<br />با آن‌ها رشد می‌کنی</h3><p>برای هر رول چند هیروی مشخص نگه دار و ببین انتخاب هر مچ داخل برنامه تمرینی‌ات بوده یا نه.</p></div>
          <HeroPoolPreview />
        </article>
        <article className="feature-story is-reversed">
          <div className="feature-story-copy"><span lang="en">02 · MATCH REVIEW</span><h3>تصمیم‌های خوب را<br />از اشتباه‌ها جدا کن</h3><p>بعد از هر بازی، کارهای خوب و اشتباه‌هایت را کنار آمار همان مچ نگه دار و الگوهای تکراری را پیدا کن.</p></div>
          <ReviewPreview />
        </article>
        <article className="feature-story">
          <div className="feature-story-copy"><span lang="en">03 · DRAFT MEMORY</span><h3>Draft را همان‌طور که<br />اتفاق افتاد ببین</h3><p>بن‌های مچ کنار Hero Pool همان رول قرار می‌گیرند تا Draft را با همان شرایطی که بازی کردی مرور کنی.</p></div>
          <DraftPreview />
        </article>
        <footer className="feature-final-cta"><AppLogo size={78} alt="" /><h2>مچ بعدی، شروع تحلیل بعدی است.</h2><button className="primary-button" type="button" onClick={onPlayerLogin}>ورود به ژورنال</button></footer>
      </section>
    </main>
  );
}

function HeroPoolPreview() {
  const heroes = [1, 8, 44, 48, 93].map((id) => heroById(id)).filter(Boolean);
  return <div className="feature-visual pool-preview"><header><span lang="en">SAFE LANE</span><b>۵ / ۸</b></header><div>{heroes.map((hero, index) => hero && <span key={hero.id} style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}><img src={heroImage(hero)} alt="" /><b lang="en">{hero.name}</b></span>)}</div><footer><i /> HERO POOL · BALANCED</footer></div>;
}

function ReviewPreview() {
  return <div className="feature-visual review-preview"><header><span lang="en">MATCH #842913</span><b>Victory</b></header><section className="is-positive"><strong>نکات مثبت</strong><p><Check aria-hidden="true" /> کنترل خوب Rune پیش از دقیقه ۶</p><p><Check aria-hidden="true" /> حفظ TP برای درگیری Roshan</p></section><section className="is-negative"><strong>نکات منفی</strong><p><CircleX aria-hidden="true" /> ورود بدون Vision به Triangle</p></section></div>;
}

function DraftPreview() {
  const heroes = [74, 14, 25, 86, 44].map((id) => heroById(id)).filter(Boolean);
  return <div className="feature-visual draft-preview"><header><span lang="en">RANKED · ALL DRAFT</span><b>DOTA2NOTES</b></header><div>{heroes.map((hero, index) => hero && <span className={`ban-portrait${index < 2 ? " is-pool-priority" : ""}`} key={hero.id}><span className="ban-portrait-image"><img src={heroImage(hero)} alt="" /></span><b lang="en">{hero.name}</b></span>)}</div><footer>MID LANE HERO POOL</footer></div>;
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
      <div className={`match-hero-row${match.heroPoolEligible ? match.heroPoolMatch ? " is-in-pool" : " is-outside-pool" : ""}`}>
        {hero && <span className="match-hero-portrait"><img src={heroImage(hero)} alt="" /></span>}
        <div>
          <h4 className="match-hero" lang="en">{match.heroName || "بدون هیرو"}</h4>
          <span className="match-meta" lang="en">
            {roleLabel(match.role)} · {queueLabel(match.queueType)}
          </span>
        </div>
      </div>
      {match.dotaMatchId && (
        <div className="match-combat-stats" aria-label="خلاصه آمار مچ">
          <span title="Game mode"><GameIcon name="mode" /><b lang="en" dir="ltr">{match.gameModeName || "—"}</b></span>
          <span title="K / D / A"><GameIcon name="kda" /><b lang="en" dir="ltr">{match.kills ?? "—"}/{match.deaths ?? "—"}/{match.assists ?? "—"}</b></span>
          <span className="is-gold" title="Gold per minute"><GameIcon name="gold" /><b lang="en" dir="ltr">{match.goldPerMinute ?? "—"}</b></span>
          <span className="is-networth" title="Net worth"><GameIcon name="gold" /><b lang="en" dir="ltr">{match.netWorth?.toLocaleString("en-US") ?? "—"}</b></span>
        </div>
      )}
      {(match.bans.length > 0 || match.legacyBans) && (
        <p className="match-bans">
          بن‌ها: {match.bans.map((ban) => ban.name).join("، ") || match.legacyBans}
        </p>
      )}
      {match.notes && <p className="match-notes">{match.notes}</p>}
      {match.dotaMatchId && (
        <div className="match-auto-meta">
          <span lang="en" dir="ltr">#{match.dotaMatchId}</span>
          <span className={`match-image-state is-${match.images?.length ? "ready" : match.imageJobStatus || "pending"}`}>
            {match.images?.length
              ? `${faNumber.format(match.images.length)} تصویر`
              : match.imageJobStatus === "processing"
                ? "در حال آماده‌سازی"
                : match.imageJobStatus === "failed"
                  ? "تصاویر آماده نیست"
                  : "در حال آماده‌سازی"}
          </span>
        </div>
      )}
    </button>
  );
}
