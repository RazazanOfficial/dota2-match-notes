"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleX,
  CircleGauge,
  ClockAlert,
  Database,
  Gamepad2,
  Copy,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  Settings,
  Share2,
  Shield,
  UserRound,
} from "lucide-react";
import { toast } from "react-toastify";
import { HEROES, heroById, heroImage } from "@/data/heroes";
import {
  getHeroPool,
  logout,
  purgeLegacyBrowserCache,
  restorePlayer,
  updateHeroPool,
  viewCoach,
  viewPlayer,
} from "@/lib/api";
import { queueLabel, roleLabel } from "@/lib/constants";
import { matchCardGameModeName } from "@/lib/dota/modes";
import {
  faNumber,
  faPercent,
  formatDayDate,
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
  toDateKey,
  toJournalDateKey,
} from "@/lib/date";
import type { HeroPoolData, Match, MatchRole, Profile, Session } from "@/lib/types";
import ReportDialog from "./ReportDialog";
import SyncPanel from "./SyncPanel";
import AppLogo from "./AppLogo";
import { GameIcon } from "./GameIcon";
import HeroPoolDialog from "./HeroPoolDialog";
import ReleaseNotes from "./ReleaseNotes";
import AccountSettingsDialog from "./AccountSettingsDialog";
import LoginDialog from "./LoginDialog";
import PlayerSearchDialog from "./PlayerSearchDialog";
import MatchFilters, { type JournalModeFilter } from "./MatchFilters";

type AccessView = "roles" | "coach";
const EMPTY_PROFILE: Profile = { username: "", days: {} };
const ROLE_ICONS: Partial<Record<MatchRole, string>> = {
  safe_lane: "Safelane.png",
  mid_lane: "MidLane.png",
  off_lane: "OffLane.png",
  soft_support: "SoftSupport.png",
  hard_support: "HardSupport.png",
};

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
  const [modeFilters, setModeFilters] = useState<JournalModeFilter[]>([]);
  const [positionFilters, setPositionFilters] = useState<MatchRole[]>([]);
  const [heroFilters, setHeroFilters] = useState<number[]>([]);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const membershipDate = viewingHandle
    ? profile.registeredDate || profile.createdAt
    : session?.registeredDate || profile.registeredDate || session?.createdAt || profile.createdAt;
  const anchorDate = useMemo(
    () => getWeekAnchorDate(membershipDate || toJournalDateKey(new Date())),
    [membershipDate],
  );
  const trackingStartDate = anchorDate;
  const canEdit = session?.mode === "player" && !viewingHandle;
  const dates = useMemo(() => getWeekDates(anchorDate, activeWeek), [activeWeek, anchorDate]);
  const rangeFrom = toDateKey(dates[0]);
  const rangeTo = toDateKey(dates[dates.length - 1]);
  const currentWeekIndex = getCurrentWeekIndex(anchorDate);

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
    setActiveWeek(currentWeekIndex);
  }, [anchorDate, currentWeekIndex, session?.username, viewingHandle]);

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
    if (!session) return;

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
  }, [rangeFrom, rangeTo, session, refreshVersion, viewingHandle]);

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
      setBusy(false);
    }
  }

  const weekMatches = useMemo(() => dates.flatMap((date) => profile.days[toDateKey(date)]?.matches || []), [dates, profile.days]);
  const modeOptions = useMemo(() => {
    const options = new Map<JournalModeFilter,string>();
    weekMatches.forEach((match) => {
      if(match.gameModeId!==null&&match.gameModeId!==undefined)options.set(`mode:${match.gameModeId}`,match.gameModeName||`Mode ${match.gameModeId}`);
      if(match.lobbyTypeId!==null&&match.lobbyTypeId!==undefined&&match.lobbyTypeName)options.set(`lobby:${match.lobbyTypeId}`,match.lobbyTypeName);
    });
    return [...options.entries()].map(([value,label])=>({value,label}));
  },[weekMatches]);
  const heroOptions = useMemo(() => {
    const ids=new Set(weekMatches.flatMap((match)=>match.heroId?[match.heroId]:[]));
    return HEROES.filter((hero)=>ids.has(hero.id));
  },[weekMatches]);
  useEffect(()=>{
    setModeFilters((current)=>current.filter((value)=>modeOptions.some((option)=>option.value===value)));
    setHeroFilters((current)=>current.filter((id)=>heroOptions.some((hero)=>hero.id===id)));
  },[heroOptions,modeOptions]);
  const matchesFilter = (match:Match) => {
    const modeMatches=!modeFilters.length||modeFilters.some((filter)=>filter.startsWith("mode:")?match.gameModeId===Number(filter.slice(5)):match.lobbyTypeId===Number(filter.slice(6)));
    return modeMatches&&(!positionFilters.length||(match.role!==""&&positionFilters.includes(match.role)))&&(!heroFilters.length||(match.heroId!==null&&heroFilters.includes(match.heroId)));
  };
  const filteredWeekMatches=weekMatches.filter(matchesFilter);
  const weekSummary = summarizeMatches(filteredWeekMatches);
  const filtersActive=modeFilters.length>0||positionFilters.length>0||heroFilters.length>0;
  const reportProfile=filtersActive?{
    ...profile,
    days:Object.fromEntries(Object.entries(profile.days).map(([dateKey,day])=>[dateKey,{...day,matches:day.matches.filter(matchesFilter)}])),
  }:profile;

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
              registrationDate={trackingStartDate}
              weekLabel={getWeekLabel(activeWeek)}
              weekRangeLabel={formatWeekRange(dates)}
              canGoPreviousWeek={activeWeek > 0}
              canGoNextWeek={activeWeek < currentWeekIndex}
              onPreviousWeek={() => setActiveWeek((week) => Math.max(0, week - 1))}
              onCurrentWeek={() => setActiveWeek(currentWeekIndex)}
              onNextWeek={() => setActiveWeek((week) => Math.min(currentWeekIndex, week + 1))}
              onReport={() => setReportOpen(true)}
              onMatchesImported={() => setRefreshVersion((version) => version + 1)}
            />
          )}
          <section className="week-overview">
            {!canEdit && (
              <div className="week-heading is-readonly">
                <div>
                  <p className="week-kicker"><span aria-hidden="true" />{getWeekLabel(activeWeek)}</p>
                  <h2>{formatWeekRange(dates)}</h2>
                </div>
                <div className="week-navigation" aria-label="پیمایش هفته‌ها">
                  <button className="nav-button" type="button" disabled={activeWeek <= 0} onClick={() => setActiveWeek((week) => Math.max(0, week - 1))}>هفته قبل</button>
                  <button className="today-button" type="button" onClick={() => setActiveWeek(currentWeekIndex)}>هفته جاری</button>
                  <button className="nav-button" type="button" disabled={activeWeek >= currentWeekIndex} onClick={() => setActiveWeek((week) => Math.min(currentWeekIndex, week + 1))}>هفته بعد</button>
                </div>
              </div>
            )}
            <div className="week-stats">
              <div className="week-cards">
                <Stat label="کل بازی‌ها" value={faNumber.format(weekSummary.games)} />
                <Stat label="برد" value={faNumber.format(weekSummary.wins)} tone="win" />
                <Stat label="باخت" value={faNumber.format(weekSummary.losses)} tone="loss" />
                <Stat label="نرخ برد" value={faPercent.format(weekSummary.winRate)} />
              </div>
              <MatchFilters modeOptions={modeOptions} heroOptions={heroOptions} selectedModes={modeFilters} selectedPositions={positionFilters} selectedHeroes={heroFilters} visibleCount={filteredWeekMatches.length} totalCount={weekMatches.length} onModesChange={setModeFilters} onPositionsChange={setPositionFilters} onHeroesChange={setHeroFilters} onReset={()=>{setModeFilters([]);setPositionFilters([]);setHeroFilters([]);}} />
            </div>
          </section>

          <section className="calendar" aria-label="تقویم هفتگی">
            {dates.map((date) => {
              const dateKey = toDateKey(date);
              const day = profile.days[dateKey] || { completed: false, matches: [] };
              const visibleMatches=day.matches.filter(matchesFilter);
              const summary = summarizeMatches(visibleMatches);
              const today = toJournalDateKey(new Date()) === dateKey;
              const disabled = dateKey < trackingStartDate;
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
                  </header>
                  <div className="matches">
                    {visibleMatches.length ? (
                      visibleMatches
                        .slice()
                        .sort((a, b) => a.number - b.number)
                        .map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            href={disabled ? undefined : `/match/${encodeURIComponent(match.dotaMatchId || match.id)}${viewingHandle ? `?player=${encodeURIComponent(viewingHandle)}` : ""}`}
                          />
                        ))
                    ) : (
                      <div className="empty-day">{disabled ? "پیش از شروع دفتر" : filtersActive&&day.matches.length ? "مچی مطابق فیلتر نیست" : "هنوز مچی ثبت نشده"}</div>
                    )}
                  </div>
                  <footer className="day-summary">
                    <div className="day-stat"><span>برد</span><strong>{faNumber.format(summary.wins)}</strong></div>
                    <div className="day-stat"><span>باخت</span><strong>{faNumber.format(summary.losses)}</strong></div>
                    <span className="day-complete-readonly">
                      {disabled ? "پیش از شروع پیگیری" : day.completed ? "روز جمع‌بندی شد" : "در انتظار دریافت"}
                    </span>
                  </footer>
                </article>
              );
            })}
          </section>
        </main>
      </div>

      <ReportDialog
        open={reportOpen}
        profile={reportProfile}
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (view === "coach") {
        const action = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement
          ? ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value
          : "player";
        const normalized = username.normalize("NFKC").trim();
        if (action === "match") {
          if (!/^\d{6,20}$/.test(normalized)) throw new Error("Match ID باید فقط شامل عدد باشد");
          window.location.assign(`/match/${normalized}`);
          return;
        }
        await onCoachLogin(normalized);
      }
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
            <h2>{view === "roles" ? "چطور می‌خواهی وارد شوی؟" : "بازیکن یا مچ موردنظر را پیدا کن"}</h2>
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
                <span>شناسه بازیکن یا Match ID</span>
                <input
                  lang="en"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="Account ID، SteamID64 یا Match ID"
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
                <button className="primary-button" type="submit" value="player" disabled={busy}>
                  {busy ? "در حال پیدا کردن" : "مشاهده دفتر"}
                </button>
                <button className="secondary-button" type="submit" value="match" disabled={busy}>
                  مشاهده Match
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

export function MatchCard({ match, href, onClick }: { match: Match; href?: string; onClick?: () => void }) {
  const hero = match.heroId ? heroById(match.heroId) : null;
  const analysisStatus=match.analysisStatus||"basic";
  const analysisBadge=analysisStatus==="ready"
    ? {label:"تحلیل آماده",icon:<Check/>}
    : analysisStatus==="pending"||analysisStatus==="processing"
      ? {label:analysisStatus==="processing"?"در حال تحلیل":"در صف تحلیل",icon:<CircleGauge/>}
      : analysisStatus==="failed"
        ? {label:"تحلیل ناموفق",icon:<ClockAlert/>}
      : analysisStatus==="expired"
          ? {label:"Replay قدیمی",icon:<ClockAlert/>}
          : {label:"داده پایه",icon:<Database/>};
  const visibleGameMode = matchCardGameModeName(
    match.gameModeId,
    match.lobbyTypeId,
    match.gameModeName,
  );
  async function copyMatchId() {
    if (!match.dotaMatchId) return;
    try {
      await copyText(String(match.dotaMatchId));
      toast.success("Match ID کپی شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "کپی Match ID انجام نشد");
    }
  }
  const cardBody = (
    <>
      <div className="match-card-identity">
        <div className={`match-hero-row${match.heroPoolEligible ? match.heroPoolMatch ? " is-in-pool" : " is-outside-pool" : ""}`}>
          {hero && <span className="match-hero-portrait"><img src={heroImage(hero)} alt="" /></span>}
          <h4 className="match-hero" lang="en">{match.heroName || "بدون هیرو"}</h4>
        </div>
        <div className="match-role-tags">
          <span className="match-role-tag" lang="en">
            {match.role && ROLE_ICONS[match.role] && <img src={`/positions/${ROLE_ICONS[match.role]}`} alt="" />}
            {roleLabel(match.role)}
          </span>
          <span className="match-role-tag" lang="en">{queueLabel(match.queueType)}</span>
        </div>
      </div>
      <div className="match-game-mode">
        <GameIcon name="mode" />
        <span lang="en" dir="ltr">Game Mode</span>
        <strong lang="en" dir="ltr">{visibleGameMode}</strong>
      </div>
      {match.notes && <p className="match-notes">{match.notes}</p>}
    </>
  );
  return (
    <article className={`match-card is-${match.result} analysis-${analysisStatus}`}>
      <header className="match-card-header">
        <span className="match-number"><Gamepad2 aria-hidden="true" /> بازی {faNumber.format(match.number)}</span>
        <span className={`result-badge is-${match.result}`}>
          {match.result === "win" ? "برد" : "باخت"}
        </span>
      </header>
      {href ? (
        <Link className="match-card-open" href={href}>{cardBody}</Link>
      ) : (
        <button className="match-card-open" type="button" onClick={onClick}>{cardBody}</button>
      )}
      {match.dotaMatchId && (
        <footer className="match-card-footer">
          <span className="match-analysis-badge">{analysisBadge.icon}{analysisBadge.label}</span>
          <button className="match-id-copy" type="button" onClick={() => void copyMatchId()} title="کپی Match ID">
            <span><small>Match ID</small><b lang="en" dir="ltr">{match.dotaMatchId}</b></span>
            <Copy aria-hidden="true" />
          </button>
        </footer>
      )}
    </article>
  );
}
