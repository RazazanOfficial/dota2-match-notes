import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, ArrowUpRight, CircleHelp, Gamepad2, KeyRound, LifeBuoy, ShieldCheck } from "lucide-react";
import type { Preferences } from "@dota-notes/design-tokens";
import { apiRequest } from "../api";
import type { Messages } from "../i18n";
import { LanguageSwitch } from "./PreferenceControls";
import { PasswordField } from "./PasswordField";
import { signupChoiceKey } from "../desktopAuth";
import { emailErrorMessage } from "./emailError";

const supportUrl = import.meta.env.VITE_SUPPORT_TELEGRAM_URL || "";
const validSupportUrl = /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$/.test(supportUrl);

export function Login({ preferences, setPreferences, t, busy, error, onSteam, onPassword, clearError }: {
    preferences: Preferences;
    setPreferences: Dispatch<SetStateAction<Preferences>>;
    t: Messages;
    busy: boolean;
    error: string;
    onSteam: (signup?: boolean) => Promise<void>;
    onPassword: (steamIdentifier: string, password: string) => Promise<void>;
    clearError: () => void;
}) {
    type Screen = "login" | "signup" | "recover";
    const [screen, setScreen] = useState<Screen>(() => localStorage.getItem(signupChoiceKey) === "1" ? "signup" : "login");
    const [visibleScreen, setVisibleScreen] = useState<Screen>(() => { const choice = localStorage.getItem(signupChoiceKey) === "1"; localStorage.removeItem(signupChoiceKey); return choice ? "signup" : "login"; });
    const [switching, setSwitching] = useState(false);
    const screenTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(screenTimer.current), []);
    const [method, setMethod] = useState<"steam" | "password">("steam");
    const [steamIdentifier, setSteamIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [recovery, setRecovery] = useState<"email" | "code">("email");
    const [recoveryIdentifier, setRecoveryIdentifier] = useState("");
    const [recoveryCode, setRecoveryCode] = useState("");
    const [recoveryStep, setRecoveryStep] = useState(false);
    const [recoveryPassword, setRecoveryPassword] = useState(""), [confirmPassword, setConfirmPassword] = useState("");
    const [working, setWorking] = useState(false), [recoveryError, setRecoveryError] = useState(""), [notice, setNotice] = useState("");
    const recoveryRules = [recoveryPassword.length >= 6, /[a-z]/.test(recoveryPassword), /[A-Z]/.test(recoveryPassword), /\d/.test(recoveryPassword), /[^\p{L}\p{N}\s]/u.test(recoveryPassword)];
    const recoveryStrength = recoveryRules.filter(Boolean).length;
    const ruleLabels = [t.ruleLength, t.ruleLower, t.ruleUpper, t.ruleDigit, t.ruleSymbol];
    function changeScreen(next: Screen) {
        if (next === screen) return;
        window.clearTimeout(screenTimer.current);
        setScreen(next);
        setSwitching(true);
        clearError(); setRecoveryError(""); setNotice("");
        screenTimer.current = window.setTimeout(() => {
            setVisibleScreen(next);
            setSwitching(false);
        }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320);
    }
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!busy) void onPassword(steamIdentifier.trim(), password).finally(() => setPassword(""));
    }
    async function sendEmail(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setWorking(true); setRecoveryError("");
        try { await apiRequest("/api/auth/recovery/request", { method: "POST", body: JSON.stringify({ email: recoveryIdentifier.trim() }) }); setRecoveryStep(true); setNotice(t.recoverSent); }
        catch (failure) { setRecoveryError(emailErrorMessage(failure, t)); }
        finally { setWorking(false); }
    }
    async function resetPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setWorking(true); setRecoveryError("");
        try {
            await apiRequest("/api/auth/recovery/reset", { method: "POST", body: JSON.stringify({ method: recovery === "email" ? "email" : "recovery", identifier: recoveryIdentifier.trim(), code: recoveryCode.trim(), password: recoveryPassword, confirmPassword }) });
            setRecoveryCode(""); setRecoveryPassword(""); setConfirmPassword(""); setRecoveryStep(false); changeScreen("login"); setMethod("password"); setNotice(t.recoverDone);
        } catch (failure) { setRecoveryError(String(failure)); }
        finally { setWorking(false); }
    }
    return <div className="login-shell" data-language={preferences.language}>
        <header className="login-header"><div className="login-brand"><img src="/logo.png" alt=""/><bdi>Dota Notes</bdi><span>{t.loginDesktop}</span></div><LanguageSwitch preferences={preferences} setPreferences={setPreferences} t={t}/></header>
        <main className="login-stage">
            <section className="login-story" aria-labelledby="login-story-title">
                <span className="login-kicker"><i/>{t.loginKicker}</span>
                <h1 id="login-story-title">{t.loginHeroTitle}</h1><p>{t.loginHeroBody}</p>
                <div className="login-story-tags" aria-label={t.loginFeatures}><span className="strength">{t.loginAnalysis}</span><span className="agility">{t.loginReplayFeature}</span><span className="intelligence">{t.loginCoachFeature}</span><span className="universal"><i className="universal-dot" aria-hidden="true"/>{t.loginSmartReport}</span></div>
                <div className="login-art" aria-hidden="true"><span className="login-orbit orbit-one"/><span className="login-orbit orbit-two"/><span className="login-orbit orbit-three"/><img src="/logo.png" alt=""/></div>
            </section>
            <section className="login-card" aria-labelledby="login-title">
                <div className="login-card-top"><div className="login-card-icon"><ShieldCheck size={23} aria-hidden="true"/></div><span>{visibleScreen === "recover" ? t.forgotPassword : visibleScreen === "signup" ? t.signupAccess : t.loginAccess}</span></div>
                <div key={visibleScreen} className={`login-view${switching ? " is-leaving" : ""}`}>
                {visibleScreen !== "recover" ? <>
                    <div className="login-access-switch" role="group" aria-label={t.loginAccess}><button aria-pressed={screen === "login"} className={screen === "login" ? "active" : ""} onClick={() => changeScreen("login")}>{t.loginAccess}</button><button aria-pressed={screen === "signup"} className={screen === "signup" ? "active" : ""} onClick={() => changeScreen("signup")}>{t.signupAccess}</button></div>
                    <h2 id="login-title">{visibleScreen === "signup" ? t.signupTitle : t.loginTitle}</h2><p className="login-card-description">{visibleScreen === "signup" ? t.signupDescription : t.loginDescription}</p>
                    {visibleScreen === "login" ? <>
                        <div className="login-methods" role="tablist" aria-label={t.loginMethod}><button type="button" role="tab" aria-selected={method === "steam"} className={method === "steam" ? "active" : ""} onClick={() => { setMethod("steam"); clearError(); }}><Gamepad2 size={17}/>{t.loginSteamTab}</button><button type="button" role="tab" aria-selected={method === "password"} className={method === "password" ? "active" : ""} onClick={() => { setMethod("password"); clearError(); }}><KeyRound size={17}/>{t.loginPasswordTab}</button></div>
                        {method === "steam" ? <div className="login-method-body"><button className="login-submit" type="button" disabled={busy} onClick={() => void onSteam(false)}><span>{busy ? t.loginConnecting : t.loginWithSteam}</span><ArrowUpRight size={18}/></button><p className="login-help">{t.loginBrowserHint}</p></div>
                            : <form className="login-password-form" onSubmit={submit}><div className="login-label-row"><label htmlFor="login-steam-id">{t.loginIdentifier}</label><span className="steam-id-help" tabIndex={0} aria-label={t.steamIdHelp}><CircleHelp size={17}/><span className="steam-id-tooltip" role="tooltip">{[t.steamIdStep1,t.steamIdStep2,t.steamIdStep3].map((step,index) => <span key={step}>{index + 1}. {step}</span>)}</span></span></div><input id="login-steam-id" dir="ltr" inputMode="numeric" autoComplete="username" value={steamIdentifier} onChange={event => setSteamIdentifier(event.target.value)} placeholder={t.loginIdentifierPlaceholder} required/><label htmlFor="login-password">{t.loginPassword}</label><PasswordField t={t} id="login-password" dir="ltr" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/><button className="login-submit" type="submit" disabled={busy}><span>{busy ? t.loginConnecting : t.loginWithPassword}</span><ArrowUpRight size={18}/></button><p className="login-help">{t.loginPasswordHint}</p><button type="button" className="login-link" onClick={() => changeScreen("recover")}>{t.forgotPassword}</button></form>}
                    </> : <div className="signup-choices"><button className="login-submit" disabled={busy} onClick={() => void onSteam(true)}><span>{busy ? t.loginConnecting : t.signupWithSteam}</span><ArrowUpRight size={18}/></button><p className="login-help">{t.signupSteamHint}</p><div className="signup-support"><LifeBuoy size={20}/><div><strong>{t.signupSupportTitle}</strong><p>{t.signupSupportText}</p>{validSupportUrl ? <a href={supportUrl} target="_blank" rel="noreferrer">{t.signupSupportAction} ↗</a> : <small>{t.signupSupportPending}</small>}</div></div></div>}
                </> : <><button className="login-link" onClick={() => changeScreen("login")}><ArrowLeft size={16}/>{t.loginBack}</button><h2 id="login-title">{t.recoverTitle}</h2><p className="login-card-description">{t.recoverDescription}</p><div className="login-methods"><button className={recovery === "email" ? "active" : ""} onClick={() => { setRecovery("email"); setRecoveryStep(false); setRecoveryIdentifier(""); setRecoveryCode(""); }}>{t.recoverEmail}</button><button className={recovery === "code" ? "active" : ""} onClick={() => { setRecovery("code"); setRecoveryStep(false); setRecoveryIdentifier(""); setRecoveryCode(""); }}>{t.recoverBackup}</button></div>{recovery === "email" && !recoveryStep ? <form className="login-password-form" onSubmit={sendEmail}><label htmlFor="recover-email">{t.recoverEmail}</label><input id="recover-email" type="email" autoComplete="email" value={recoveryIdentifier} onChange={event => setRecoveryIdentifier(event.target.value)} required/><button className="login-submit" disabled={working}>{working ? t.loginConnecting : t.recoverSend}</button></form> : <form className="login-password-form" onSubmit={resetPassword}>{recovery === "code" && <><label htmlFor="recover-id">{t.loginIdentifier}</label><input id="recover-id" inputMode="numeric" dir="ltr" value={recoveryIdentifier} onChange={event => setRecoveryIdentifier(event.target.value)} required/></>}<label htmlFor="recover-code">{recovery === "email" ? t.emailCode : t.recoverBackup}</label><input id="recover-code" dir="ltr" maxLength={6} value={recoveryCode} onChange={event => setRecoveryCode(event.target.value.toUpperCase())} required/><label htmlFor="recover-new">{t.newPassword}</label><PasswordField t={t} id="recover-new" autoComplete="new-password" maxLength={72} value={recoveryPassword} onChange={event => setRecoveryPassword(event.target.value)} required/><div className={`signup-strength level-${recoveryStrength}`}><span style={{width:`${recoveryStrength * 20}%`}}/></div><ul className="signup-rules">{ruleLabels.map((label,index) => <li className={recoveryRules[index] ? "met" : "unmet"} key={label}>{recoveryRules[index] ? "✓" : "×"}<span>{label}</span></li>)}</ul><label htmlFor="recover-confirm">{t.confirmPassword}</label><PasswordField t={t} id="recover-confirm" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required/><button className="login-submit" disabled={working || recoveryCode.length !== 6 || recoveryStrength !== 5 || recoveryPassword !== confirmPassword}>{working ? t.loginConnecting : t.recoverReset}</button></form>}</>}
                </div>
                {notice && <p className="login-note" role="status">{notice}</p>}{recoveryError && <p className="login-error" role="alert">{recoveryError}</p>}
                {error && <div className="login-error" role="alert"><strong>{t.loginFailed}</strong><details><summary>{t.loginErrorDetails}</summary><bdi>{error}</bdi></details></div>}
            </section>
        </main><footer className="login-footer"><span>DOTA NOTES</span><span>{t.loginFooter}</span></footer>
    </div>;
}
