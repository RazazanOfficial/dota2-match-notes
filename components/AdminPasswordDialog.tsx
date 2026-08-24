"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";

interface PasswordUser {
  id: string;
  displayName: string;
  handle: string;
  hasPassword: boolean;
}

export default function AdminPasswordDialog({
  user,
  onClose,
  onChange,
}: {
  user: PasswordUser | null;
  onClose: () => void;
  onChange: (userId: string, hasPassword: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setPassword("");
    setConfirmPassword("");
    setError("");
  }, [user]);

  if (!user) return null;
  const selectedUser = user;

  async function request(method: "PUT" | "DELETE", body?: unknown) {
    const response = await fetch(`/api/admin/users/${selectedUser.id}/password`, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => null) as {
      hasPassword?: boolean;
      error?: { message?: string };
    } | null;
    if (!response.ok) throw new Error(result?.error?.message || "تغییر رمز انجام نشد");
    return Boolean(result?.hasPassword);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const hasPassword = await request("PUT", { password, confirmPassword });
      onChange(selectedUser.id, hasPassword);
      toast.success(`رمز ${selectedUser.displayName} ذخیره شد`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تغییر رمز انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const hasPassword = await request("DELETE");
      onChange(selectedUser.id, hasPassword);
      toast.success(`ورود با رمز برای ${selectedUser.displayName} غیرفعال شد`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "حذف رمز انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal admin-password-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <p className="modal-kicker" lang="en">USER ACCESS</p>
            <h2>رمز عبور {user.displayName}</h2>
            <span lang="en" dir="ltr">{user.handle}</span>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن"><X aria-hidden="true" /></button>
        </header>
        <div className="password-settings-form">
          <label className="field"><span>رمز عبور جدید</span><input type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label className="field"><span>تکرار رمز عبور</span><input type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          {error && <p className="form-error field-full" role="alert">{error}</p>}
        </div>
        <footer className="modal-actions">
          {user.hasPassword && <button className="secondary-button danger-button" type="button" disabled={busy} onClick={remove}><Trash2 aria-hidden="true" /> حذف رمز</button>}
          <span className="action-spacer" />
          <button className="primary-button" type="submit" disabled={busy}><KeyRound aria-hidden="true" /> {busy ? "در حال ذخیره" : "ثبت رمز"}</button>
        </footer>
      </form>
    </div>
  );
}
