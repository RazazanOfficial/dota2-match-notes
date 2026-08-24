"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";
import { removeAccountPassword, updateAccountPassword } from "@/lib/api";

export default function AccountSettingsDialog({
  open,
  hasPassword,
  onClose,
  onPasswordStateChange,
}: {
  open: boolean;
  hasPassword: boolean;
  onClose: () => void;
  onPasswordStateChange: (hasPassword: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirmPassword("");
    setConfirmRemove(false);
    setError("");
  }, [open]);

  if (!open) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await updateAccountPassword(password, confirmPassword);
      onPasswordStateChange(result.hasPassword);
      setPassword("");
      setConfirmPassword("");
      toast.success(hasPassword ? "رمز عبور تغییر کرد" : "رمز عبور فعال شد");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ذخیره رمز عبور انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const result = await removeAccountPassword();
      onPasswordStateChange(result.hasPassword);
      setConfirmRemove(false);
      toast.success("ورود با رمز عبور غیرفعال شد");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "حذف رمز عبور انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal account-settings-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div><p className="modal-kicker" lang="en">ACCOUNT SECURITY</p><h2>تنظیمات حساب</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن"><X aria-hidden="true" /></button>
        </header>
        <div className={`password-state${hasPassword ? " is-active" : ""}`}>
          <ShieldCheck aria-hidden="true" />
          <div><strong>{hasPassword ? "ورود با رمز فعال است" : "ورود با رمز غیرفعال است"}</strong><span>ورود با Steam همیشه در دسترس می‌ماند.</span></div>
        </div>
        <form className="password-settings-form" onSubmit={save}>
          <label className="field"><span>رمز عبور جدید</span><input type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label className="field"><span>تکرار رمز عبور</span><input type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          {error && <p className="form-error field-full" role="alert">{error}</p>}
          <footer className="modal-actions field-full">
            {hasPassword && !confirmRemove && <button className="secondary-button danger-button" type="button" onClick={() => setConfirmRemove(true)}><Trash2 aria-hidden="true" /> حذف رمز</button>}
            {confirmRemove && <><span className="password-remove-warning">ورود با رمز غیرفعال شود؟</span><button className="danger-solid-button" type="button" disabled={busy} onClick={remove}>تأیید حذف</button><button className="secondary-button" type="button" onClick={() => setConfirmRemove(false)}>انصراف</button></>}
            <span className="action-spacer" />
            <button className="primary-button" type="submit" disabled={busy}><KeyRound aria-hidden="true" /> {busy ? "در حال ذخیره" : hasPassword ? "تغییر رمز" : "فعال‌کردن رمز"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
