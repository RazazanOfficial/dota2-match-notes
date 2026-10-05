import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowUpRight, Gamepad2, KeyRound, ShieldCheck } from "lucide-react";
import type { Preferences } from "@dota-notes/design-tokens";
import type { Messages } from "../i18n";
import { LanguageSwitch } from "./PreferenceControls";

export function Login({ preferences, setPreferences, t, busy, error, onSteam, onPassword, clearError }: {
    preferences: Preferences;
    setPreferences: Dispatch<SetStateAction<Preferences>>;
    t: Messages;
    busy: boolean;
    error: string;
    onSteam: () => Promise<void>;
    onPassword: (steamIdentifier: string, password: string) => Promise<void>;
    clearError: () => void;
}) {
    const [method, setMethod] = useState<"steam" | "password">("steam");
    const [steamIdentifier, setSteamIdentifier] = useState("");
    const [password, setPassword] = useState("");
    function selectMethod(next: "steam" | "password") { setMethod(next); clearError(); }
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!busy) void onPassword(steamIdentifier.trim(), password).finally(() => setPassword(""));
    }
    return <div className="login-shell">
        <header className="login-header">
            <div className="login-brand"><img src="/logo.png" alt=""/><bdi>Dota Notes</bdi><span>{t.loginDesktop}</span></div>
            <LanguageSwitch preferences={preferences} setPreferences={setPreferences} t={t}/>
        </header>
        <main className="login-stage">
            <section className="login-story" aria-labelledby="login-story-title">
                <span className="login-kicker"><i/>{t.loginKicker}</span>
                <h1 id="login-story-title">{t.loginHeroTitle}</h1>
                <p>{t.loginHeroBody}</p>
                <div className="login-story-tags" aria-label={t.loginFeatures}><span>{t.matches}</span><span>{t.analysis}</span><span>{t.replay}</span></div>
                <div className="login-art" aria-hidden="true"><span className="login-orbit orbit-one"/><span className="login-orbit orbit-two"/><span className="login-orbit orbit-three"/><img src="/logo.png" alt=""/></div>
            </section>
            <section className="login-card" aria-labelledby="login-title">
                <div className="login-card-top"><div className="login-card-icon"><ShieldCheck size={23} aria-hidden="true"/></div><span>{t.loginSecure}</span></div>
                <p className="login-card-eyebrow">{t.loginWelcome}</p>
                <h2 id="login-title">{t.loginTitle}</h2>
                <p className="login-card-description">{t.loginDescription}</p>
                <div className="login-methods" role="tablist" aria-label={t.loginMethod}>
                    <button type="button" role="tab" id="login-steam-tab" aria-selected={method === "steam"} aria-controls="login-method-panel" className={method === "steam" ? "active" : ""} onClick={() => selectMethod("steam")}><Gamepad2 size={17} aria-hidden="true"/>{t.loginSteamTab}</button>
                    <button type="button" role="tab" id="login-password-tab" aria-selected={method === "password"} aria-controls="login-method-panel" className={method === "password" ? "active" : ""} onClick={() => selectMethod("password")}><KeyRound size={17} aria-hidden="true"/>{t.loginPasswordTab}</button>
                </div>
                <div id="login-method-panel" role="tabpanel" aria-labelledby={`login-${method}-tab`}>
                    {method === "steam" ? <div className="login-method-body"><button className="login-submit" type="button" disabled={busy} onClick={() => void onSteam()}><span>{busy ? t.loginConnecting : t.loginWithSteam}</span><ArrowUpRight size={18} aria-hidden="true"/></button><p className="login-help">{t.loginBrowserHint}</p></div>
                        : <form className="login-password-form" onSubmit={submit}>
                            <label htmlFor="login-steam-id">{t.loginIdentifier}</label>
                            <input id="login-steam-id" dir="ltr" inputMode="numeric" autoComplete="username" value={steamIdentifier} onChange={event => setSteamIdentifier(event.target.value)} placeholder={t.loginIdentifierPlaceholder} required/>
                            <label htmlFor="login-password">{t.loginPassword}</label>
                            <input id="login-password" dir="ltr" type="password" autoComplete="current-password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} required/>
                            <button className="login-submit" type="submit" disabled={busy}><span>{busy ? t.loginConnecting : t.loginWithPassword}</span><ArrowUpRight size={18} aria-hidden="true"/></button>
                            <p className="login-help">{t.loginPasswordHint}</p>
                        </form>}
                </div>
                {error && <div className="login-error" role="alert"><strong>{t.loginFailed}</strong><details><summary>{t.loginErrorDetails}</summary><bdi>{error}</bdi></details></div>}
            </section>
        </main>
        <footer className="login-footer"><span>DOTA NOTES</span><span>{t.loginFooter}</span></footer>
    </div>;
}
