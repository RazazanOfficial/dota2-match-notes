import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, ArrowUpRight, Check, Copy, Download, Gift, LockKeyhole, Mail, ShieldCheck, X } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Preferences } from "@dota-notes/design-tokens";
import type { Session } from "@/lib/types";
import { apiRequest } from "../api";
import type { Messages } from "../i18n";
import { CursorControls, LanguageSwitch, PreferenceControls } from "./PreferenceControls";
import { PasswordField } from "./PasswordField";
import { emailErrorMessage } from "./emailError";

export function RegistrationWizard({ session, t, preferences, setPreferences, onFinished, onBackToSteam }: {
    session: Session; t: Messages; preferences: Preferences; setPreferences: Dispatch<SetStateAction<Preferences>>;
    onFinished: () => Promise<void>; onBackToSteam: () => Promise<void>;
}) {
    // The server owns completed security milestones. The client never stores raw passwords or recovery codes.
    const progressKey = `dota-notes.signup.step.${session.steamId}`;
    const [step, setStep] = useState(() => {
        if (!session.hasPassword) return 1;
        if (!session.recoveryCodesSavedAt) return 2;
        const saved = Number(localStorage.getItem(progressKey));
        return Math.max(session.hasVerifiedEmail ? 4 : 3, Number.isInteger(saved) ? Math.min(saved, 5) : 3);
    });
    const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
    const [passwordEnrolled, setPasswordEnrolled] = useState(Boolean(session.hasPassword));
    const [codes, setCodes] = useState<string[]>([]), [fileSaved, setFileSaved] = useState(false), [reissuePassword, setReissuePassword] = useState("");
    const [email, setEmail] = useState(""), [emailCode, setEmailCode] = useState(""), [sent, setSent] = useState(false), [verified, setVerified] = useState(Boolean(session.hasVerifiedEmail));
    const [busy, setBusy] = useState(false), [error, setError] = useState(""), [giftOpened, setGiftOpened] = useState(false);
    useEffect(() => { if (passwordEnrolled) localStorage.setItem(progressKey, String(Math.max(3, step))); }, [progressKey, passwordEnrolled, step]);
    useEffect(() => { if (step !== 5 || giftOpened) return; const timer = window.setTimeout(() => setGiftOpened(true), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1700); return () => window.clearTimeout(timer); }, [step, giftOpened]);
    const showError = (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure));
    const requirements = [password.length >= 6, /[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^\p{L}\p{N}\s]/u.test(password)];
    const labels = [t.ruleLength, t.ruleLower, t.ruleUpper, t.ruleDigit, t.ruleSymbol];
    const strength = requirements.filter(Boolean).length;
    const strengthLabel = [t.strengthEmpty, t.strengthVeryWeak, t.strengthWeak, t.strengthFair, t.strengthStrong, t.strengthVeryStrong][strength];
    async function submitPassword(event: FormEvent) {
        event.preventDefault(); if (strength < 5 || password !== confirm || busy) return;
        setBusy(true); setError("");
        try { const result = await apiRequest<{ recoveryCodes: string[] }>("/api/auth/signup/password", { method: "POST", body: JSON.stringify({ password, confirmPassword: confirm }) }); setCodes(result.recoveryCodes); setPasswordEnrolled(true); setPassword(""); setConfirm(""); setStep(2); }
        catch (failure) { showError(failure); }
        finally { setBusy(false); }
    }
    async function sendEmail(event: FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try { await apiRequest("/api/auth/email/start", { method: "POST", body: JSON.stringify({ email }) }); setSent(true); }
        catch (failure) { setError(emailErrorMessage(failure, t)); }
        finally { setBusy(false); }
    }
    async function reissueCodes(event: FormEvent) {
        event.preventDefault(); if (busy) return;
        setBusy(true); setError("");
        try {
            const result = await apiRequest<{ recoveryCodes: string[] }>("/api/auth/signup/codes/reissue", { method: "POST", body: JSON.stringify({ password: reissuePassword }) });
            setCodes(result.recoveryCodes); setReissuePassword(""); setFileSaved(false);
        } catch (failure) { showError(failure); }
        finally { setBusy(false); }
    }
    async function downloadCodes() {
        if (busy || !codes.length) return;
        setBusy(true); setError("");
        try {
            if (!fileSaved) {
                if (!isTauri()) throw new Error(t.signupDownloadNative);
                const saved = await invoke<boolean>("export_recovery_codes", { accountId: String(session.steamAccountId), codes });
                if (!saved) return;
                setFileSaved(true);
            }
            await apiRequest("/api/auth/signup/codes/saved", { method: "POST" });
            setCodes([]); setStep(3);
        } catch (failure) { showError(failure); }
        finally { setBusy(false); }
    }
    async function verifyEmail(event: FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try { await apiRequest("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ code: emailCode }) }); setVerified(true); setStep(4); }
        catch (failure) { showError(failure); }
        finally { setBusy(false); }
    }
    async function claim() {
        if (busy || !giftOpened) return;
        setBusy(true); setError("");
        try { await onFinished(); }
        catch (failure) { showError(failure); }
        finally { setBusy(false); }
    }
    function back() { setError(""); if (step === 1) void onBackToSteam(); else setStep(value => value - 1); }
    return <div className="login-shell signup-shell"><header className="login-header"><div className="login-brand"><img src="/logo.png" alt=""/><bdi>Dota Notes</bdi><span>{t.signupAccess}</span></div><LanguageSwitch {...{ preferences, setPreferences, t }}/></header><main className="signup-stage"><header className="signup-heading"><p className="login-card-eyebrow">{t.signupEyebrow}</p><h1>{t.signupWizardTitle}</h1><p>{t.signupWizardIntro}</p></header><ol className="signup-steps" dir="ltr">{[t.signupStepSteam, t.signupStepPassword, t.signupStepCodes, t.signupStepEmail, t.signupStepPreferences, t.signupStepReward].map((label, index) => <li key={label} className={index < step ? "done" : index === step ? "active" : "waiting"}><span>{index < step ? <Check size={17}/> : index + 1}</span><b>{label}</b></li>)}</ol><section className={`signup-panel${step === 4 ? " signup-panel-wide" : ""}`}>
        <button type="button" className="login-link signup-back" onClick={back} disabled={busy}><ArrowLeft size={16}/>{t.loginBack}</button>
        {step === 1 && <><div className="signup-panel-icon"><LockKeyhole/></div><h2>{t.signupCreatePassword}</h2><p className="muted">{t.signupPasswordBody}</p>{passwordEnrolled ? <button className="login-submit" onClick={() => setStep(codes.length ? 2 : 3)}>{t.signupContinue}<ArrowUpRight size={17}/></button> : <form onSubmit={event => void submitPassword(event)} className="login-password-form"><label>{t.loginPassword}<PasswordField t={t} className={`signup-password-input level-${strength}`} autoComplete="new-password" maxLength={72} value={password} onChange={event => setPassword(event.target.value)} required/></label><div className={`signup-strength level-${strength}`}><span style={{ width: `${strength * 20}%` }}/></div><div className={`signup-strength-label level-${strength}`}><span>{t.passwordStrength}</span><strong>{strengthLabel}</strong></div><ul className="signup-rules">{labels.map((label,index) => <li className={requirements[index] ? "met" : "unmet"} key={label}>{requirements[index] ? <Check size={15}/> : <X size={15}/>}<span>{label}</span></li>)}</ul><label>{t.confirmPassword}<PasswordField t={t} autoComplete="new-password" maxLength={72} value={confirm} onChange={event => setConfirm(event.target.value)} required/></label>{confirm && password !== confirm && <small className="bad">{t.passwordMismatch}</small>}<button className="login-submit" disabled={busy || strength < 5 || confirm !== password}>{busy ? t.loginConnecting : t.signupContinue}<ArrowUpRight size={17}/></button></form>}</>}
        {step === 2 && <><div className="signup-panel-icon"><ShieldCheck/></div><h2>{t.signupCodesTitle}</h2><p className="muted">{codes.length ? t.signupCodesBody : t.signupCodesUnavailable}</p>{codes.length > 0 ? <><div className="signup-codes" dir="ltr">{codes.map((code,index) => <bdi key={code}><small>{String(index + 1).padStart(2,"0")}</small>{code}</bdi>)}</div><button type="button" className="login-link" onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}><Copy size={15}/>{t.copy}</button><button type="button" className="login-submit" disabled={busy} onClick={() => void downloadCodes()}><Download size={18}/>{busy ? t.loginConnecting : t.signupDownloadContinue}</button></> : <form className="login-password-form" onSubmit={event => void reissueCodes(event)}><label>{t.loginPassword}<PasswordField t={t} autoComplete="current-password" value={reissuePassword} onChange={event => setReissuePassword(event.target.value)} required/></label><button className="login-submit" disabled={busy || !reissuePassword}>{busy ? t.loginConnecting : t.signupReissue}<ArrowUpRight size={17}/></button></form>}</>}
        {step === 3 && <><div className="signup-panel-icon"><Mail/></div><h2>{t.signupEmailTitle}</h2><p className="muted">{t.signupEmailBody}</p>{verified ? <button className="login-submit" onClick={() => setStep(4)}>{t.signupContinue}<ArrowUpRight size={17}/></button> : !sent ? <form className="login-password-form" onSubmit={event => void sendEmail(event)}><label>{t.recoverEmail}<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required/></label><button className="login-submit" disabled={busy}>{busy ? t.loginConnecting : t.recoverSend}<ArrowUpRight size={17}/></button></form> : <form className="login-password-form" onSubmit={event => void verifyEmail(event)}><p className="muted">{t.recoverSent}</p><label>{t.emailCode}<input dir="ltr" inputMode="numeric" maxLength={6} value={emailCode} onChange={event => setEmailCode(event.target.value)} required/></label><button className="login-submit" disabled={busy || emailCode.length !== 6}>{busy ? t.loginConnecting : t.signupVerify}<ArrowUpRight size={17}/></button></form>}{!verified && <div className="signup-email-actions">{sent && <button className="login-link" onClick={() => { setSent(false); setError(""); }}>{t.signupResendEmail}</button>}<button className="login-link" onClick={() => setStep(4)}>{t.signupSkipEmail}</button></div>}</>}
        {step === 4 && <><div className="signup-panel-icon"><ShieldCheck/></div><h2>{t.signupStepPreferences}</h2><p className="muted">{t.signupPreferencesBody}</p><PreferenceControls {...{ preferences, setPreferences, t }}/><CursorControls t={t} embedded/><button className="login-submit" onClick={() => setStep(5)}>{t.signupContinue}<ArrowUpRight size={17}/></button></>}
        {step === 5 && <><div className="signup-panel-icon reward"><Gift/></div><h2>{t.signupRewardTitle}</h2><p className="muted">{t.signupRewardBody}</p><div className={`gift-scene${giftOpened ? " is-open" : ""}`} aria-hidden="true"><div className="gift-box"><span className="gift-bow"/><span className="gift-lid"/><span className="gift-body"/><span className="gift-ribbon"/></div><i className="gift-spark spark-one"/><i className="gift-spark spark-two"/><i className="gift-spark spark-three"/></div><div className="gift-reveal" role="status">{giftOpened && <span>{t.signupRewardPlaceholder}</span>}</div><button className="login-submit gift-claim" disabled={!giftOpened || busy} onClick={() => void claim()}>{busy ? t.loginConnecting : t.signupClaim}<ArrowUpRight size={17}/></button></>}
        {error && <p className="login-error" role="alert">{error}</p>}
        </section></main><footer className="login-footer"><span>DOTA NOTES</span><span>{t.loginFooter}</span></footer></div>;
}
