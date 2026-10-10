import { lazy, Suspense, useState } from "react";
import { LayoutDashboard, List, Film, Sparkles, Settings, Moon, Sun, UserRound, LogOut, ShieldCheck, TrendingUp, GraduationCap, Brain } from "lucide-react";
import { messages } from "./i18n";
import { useWindowAspect, type WindowAspectState } from "./hooks/useFixedWindow";
import { WindowControls } from "./components/WindowControls";
import { useSmoothScroll } from "./hooks/useSmoothScroll";
import { usePreferences } from "./hooks/usePreferences";
import { PreferenceControls, LanguageSwitch, CursorControls } from "./components/PreferenceControls";
import { ComingSoon, Dashboard, Matches, Replay } from "./components/Workspace";
import { LiveDashboard, LiveMatches } from "./components/LiveWorkspace";
import { LaunchDota } from "./components/LaunchDota";
import { LoadingView } from "./components/LoadingView";
import { Login } from "./components/Login";
import { useDesktopAuth, signupKey, signupChoiceKey } from "./desktopAuth";
import { API_ORIGIN, apiRequest } from "./api";
import { RegistrationWizard } from "./components/RegistrationWizard";
import CursorThemeProvider from "@/components/CursorThemeProvider";
import { Avatar } from "./components/Shared";
import type { Session } from "@/lib/types";
import type { HistoryMatch } from "./history";
import "../../web/app/(journal)/cursor-themes.css";
import "./account.css";
import { useConnection, useConnectionMonitor } from "./connection";
const Profile = lazy(() => import("./components/Profile").then(m => ({ default: m.Profile })));
const Admin = lazy(() => import("./components/Admin").then(m => ({ default: m.Admin })));
const Analysis = lazy(() => import("./components/Analysis").then(m => ({ default: m.Analysis })));
type Page = "dashboard" | "matches" | "replay" | "reports" | "settings" | "coach" | "learn" | "meta" | "profile" | "admin";
const navigation = [{ page: "dashboard", icon: LayoutDashboard }, { page: "matches", icon: List }, { page: "replay", icon: Film }, { page: "reports", icon: Sparkles }, { page: "meta", icon: TrendingUp }, { page: "coach", icon: Brain }, { page: "learn", icon: GraduationCap }, { page: "settings", icon: Settings }] as const;
type PreferenceState = ReturnType<typeof usePreferences>;
export function App({ session }: {
    session?: Session;
}) {
    useSmoothScroll();
    const prefs = usePreferences();
    const layout = useWindowAspect();
    useConnectionMonitor(API_ORIGIN, !session);
    if (!layout.ready) return <LoadingView full t={messages[prefs.preferences.language]}/>;
    return <CursorThemeProvider showSettings={false}>{session ? <Desktop session={session} prefs={prefs} layout={layout}/> : <AuthenticatedApp prefs={prefs} layout={layout}/>}</CursorThemeProvider>;
}
function AuthenticatedApp({ prefs, layout }: { prefs: PreferenceState; layout: WindowAspectState }) {
    const auth = useDesktopAuth();
    if (auth.restoring) return <LoadingView full session t={messages[prefs.preferences.language]}/>;
    if (!auth.session) return <Login preferences={prefs.preferences} setPreferences={prefs.setPreferences} t={messages[prefs.preferences.language]} busy={auth.busy || auth.restoring} error={auth.error} onSteam={auth.signIn} onPassword={async (id, password) => { localStorage.removeItem(signupKey); await auth.signInWithPassword(id, password); }} clearError={auth.clearError}/>;
    if (!auth.session.onboardingCompletedAt) return <RegistrationWizard session={auth.session} t={messages[prefs.preferences.language]} preferences={prefs.preferences} setPreferences={prefs.setPreferences} onFinished={async () => { await apiRequest("/api/auth/signup/complete", { method: "POST" }); await auth.refreshSession(); localStorage.removeItem(`dota-notes.signup.step.${auth.session?.steamId}`); localStorage.removeItem(signupKey); }} onBackToSteam={async () => { localStorage.setItem(signupChoiceKey, "1"); await auth.signOut(); }}/>;
    return <Desktop session={auth.session} prefs={prefs} layout={layout} live onLogout={() => void auth.signOut()}/>;
}
function Desktop({ session, prefs, layout, live = false, onLogout }: {
    session: Session;
    prefs: PreferenceState;
    layout: WindowAspectState;
    live?: boolean;
    onLogout?: () => void;
}) {
    const { preferences, setPreferences, mode } = prefs;
    const t = messages[preferences.language];
    const connection = useConnection();
    const [page, setPage] = useState<Page>("dashboard"), [selected, setSelected] = useState<HistoryMatch | null>(null), [notice, setNotice] = useState("");
    function navigate(next: Page) { setPage(next); setSelected(null); setNotice(""); window.scrollTo?.({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }
    function open(row: HistoryMatch) { setSelected(row); setPage("matches"); window.scrollTo?.({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }
    return <div className="desktop-shell"><aside className="sidebar"><div className="brand"><img src="/logo.png" alt=""/><div><bdi>DOTA NOTES</bdi><small>YOUR GAME. UNDERSTOOD.</small></div></div><nav aria-label={t.workspace}>{navigation.map(({ page: name, icon: Icon }) => <button key={name} className={`nav-button ${page === name ? "nav-active" : ""}`} aria-current={page === name ? "page" : undefined} onClick={() => navigate(name)}><Icon size={19}/><span>{t[name]}</span>{page === name && <i />}</button>)}</nav><div className="sidebar-bottom"><LaunchDota t={t}/><div className="sidebar-account-group"><button className="sidebar-account" aria-current={page === "profile" ? "page" : undefined} onClick={() => navigate("profile")}><Avatar session={session}/><span><bdi>{session.displayName || session.username}</bdi><small>{t.account}</small></span><UserRound size={16}/></button>{session.isSuperAdmin && <button className={`sidebar-admin ${page === "admin" ? "active" : ""}`} aria-label={t.admin} title={t.admin} aria-current={page === "admin" ? "page" : undefined} onClick={() => navigate("admin")}><ShieldCheck size={21}/></button>}</div><div className="sidebar-actions"><button title={mode === "dark" ? t.light : t.dark} aria-label={mode === "dark" ? t.light : t.dark} onClick={() => setPreferences(p => ({ ...p, appearance: mode === "dark" ? "light" : "dark" }))}>{mode === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="logout-button" onClick={() => live ? onLogout?.() : setNotice(t.offlineAction)}><LogOut size={17}/>{t.logout}</button></div></div></aside><div className="workspace-main"><header className="topbar"><div className={`connection-badge ${live && connection === "online" ? "is-online" : "is-offline"}`} role="status"><i className={`signal-dot ${live && connection === "online" ? "" : "signal-offline"}`}/><span>{live && connection === "online" ? t.onlineMode : t.offlineMode}</span></div><LanguageSwitch preferences={preferences} setPreferences={setPreferences} t={t}/></header><main>{!live && <div className="preview-badge"><i /><span>{t.demoLabel}</span></div>}{notice && <p className="panel notice" role="status">{notice}</p>}{page === "dashboard" && (live ? <LiveDashboard session={session} t={t} onOpen={open} onNavigate={navigate}/> : <Dashboard session={session} t={t} onOpen={open} onNavigate={navigate}/>)} {page === "matches" && (selected ? <Suspense fallback={<LoadingView t={t}/>}><Analysis key={selected.id} t={t} row={selected} onBack={() => setSelected(null)} live={live} session={session}/></Suspense> : live ? <LiveMatches session={session} t={t} onOpen={open}/> : <Matches session={session} t={t} onOpen={open}/>)}{page === "replay" && <Replay t={t} live={live}/>} {(["reports", "coach", "learn", "meta"] as const).map(name => page === name && <ComingSoon key={name} title={t[name]} t={t}/>)} {page === "settings" && <div className="screen-stack"><div className="page-heading"><div><p className="eyebrow">PERSONALIZE</p><h1>{t.settings}</h1><p>{t.settingsDetail}</p></div></div><section className="panel settings-panel"><PreferenceControls preferences={preferences} setPreferences={setPreferences} t={t}/><p className="muted">{t.systemDetail}</p></section><WindowControls layout={layout} t={t}/><CursorControls t={t}/></div>}{page === "profile" && <Suspense fallback={<LoadingView t={t}/>}><Profile session={session} t={t} live={live}/></Suspense>}{page === "admin" && session.isSuperAdmin && <Suspense fallback={<LoadingView t={t}/>}><Admin session={session} t={t} live={live}/></Suspense>}</main></div></div>;
}
