"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Gamepad2, KeyRound, LogIn, X } from "lucide-react";
import { ApiError, loginPlayer, loginWithPassword } from "@/lib/api";

export default function LoginDialog({
  open,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => Promise<void>;
}) {
  const [view, setView] = useState<"methods" | "password">("methods");
  const [steamIdentifier, setSteamIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registrationRequired, setRegistrationRequired] = useState(false);

  useEffect(() => {
    if (!open) return;
    setView("methods");
    setPassword("");
    setError("");
    setRegistrationRequired(false);
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setRegistrationRequired(false);
    try {
      await loginWithPassword(steamIdentifier, password);
      await onAuthenticated();
      onClose();
    } catch (reason) {
      const apiError = reason instanceof ApiError ? reason : null;
      setRegistrationRequired(
        apiError?.code === "account_not_registered" ||
          apiError?.code === "password_not_configured",
      );
      setError(reason instanceof Error ? reason.message : "ورود انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop auth-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker" lang="en">DOTA2NOTES ACCESS</p>
            <h2 id="login-dialog-title">ورود به دفتر مچ‌ها</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن">
            <X aria-hidden="true" />
          </button>
        </header>

        {view === "methods" ? (
          <div className="auth-method-grid">
            <button type="button" className="auth-method-card" onClick={loginPlayer}>
              <span><Gamepad2 aria-hidden="true" /></span>
              <strong>ورود با Steam</strong>
              <small>ورود امن و ثبت‌نام خودکار</small>
              <LogIn aria-hidden="true" />
            </button>
            <button type="button" className="auth-method-card" onClick={() => setView("password")}>
              <span><KeyRound aria-hidden="true" /></span>
              <strong>ورود با رمز عبور</strong>
              <small>Steam ID و رمز Dota2Notes</small>
              <LogIn aria-hidden="true" />
            </button>
          </div>
        ) : (
          <form className="password-login-form" onSubmit={submit}>
            <label className="field">
              <span>Steam ID یا Account ID</span>
              <input
                lang="en"
                dir="ltr"
                inputMode="numeric"
                autoComplete="username"
                value={steamIdentifier}
                onChange={(event) => setSteamIdentifier(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>رمز عبور</span>
              <input
                dir="ltr"
                type="password"
                autoComplete="current-password"
                value={password}
                minLength={8}
                maxLength={72}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {registrationRequired && (
              <button className="steam-registration-button" type="button" onClick={loginPlayer}>
                <Gamepad2 aria-hidden="true" /> ثبت‌نام یا اتصال حساب با Steam
              </button>
            )}
            <footer className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setView("methods")}>بازگشت</button>
              <span className="action-spacer" />
              <button className="primary-button" type="submit" disabled={busy}>
                <LogIn aria-hidden="true" /> {busy ? "در حال ورود" : "ورود"}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
