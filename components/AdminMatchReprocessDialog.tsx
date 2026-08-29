"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Activity, RotateCcw, X } from "lucide-react";
import { toast } from "react-toastify";
interface User { id: string; displayName: string; handle: string }
export default function AdminMatchReprocessDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [count, setCount] = useState(3); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) setCount(3); }, [user]);
  if (!user) return null;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user!.id}/matches/reprocess`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
      const body = await response.json().catch(() => null) as { result?: { refreshed: unknown[]; failed: unknown[] }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message || "تحلیل مجدد انجام نشد");
      const ok = body?.result?.refreshed.length || 0, failed = body?.result?.failed.length || 0;
      if (failed) toast.warning(`${ok.toLocaleString("fa-IR")} مچ تازه شد و ${failed.toLocaleString("fa-IR")} مچ ناموفق بود.`); else toast.success(`${ok.toLocaleString("fa-IR")} مچ برای تحلیل تازه آماده شد.`);
      onClose();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "تحلیل مجدد انجام نشد"); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}><form className="modal admin-reprocess-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><header className="modal-header"><div><p className="modal-kicker">MATCH ANALYSIS</p><h2>تحلیل مجدد مچ‌ها</h2></div><button className="close-button" type="button" onClick={onClose} disabled={busy}><X /></button></header><div className="reprocess-player"><span><Activity /></span><div><strong>{user.displayName}</strong><small lang="en" dir="ltr">{user.handle}</small></div></div><label className="field"><span>تعداد مچ‌های اخیر</span><input type="number" min="1" max="20" value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value))))} required /></label><p className="reprocess-summary">اطلاعات این مچ‌ها تازه می‌شود و تحلیل STRATZ دوباره در صف قرار می‌گیرد.</p><footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>انصراف</button><button className="primary-button" type="submit" disabled={busy}><RotateCcw />{busy ? "در حال دریافت" : "شروع تحلیل مجدد"}</button></footer></form></div>;
}
