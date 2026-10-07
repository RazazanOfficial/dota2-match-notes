"use client";

import { useCallback, useEffect, useState } from "react";
import { Folder, FileArchive, Trash2 } from "lucide-react";

type Listing = { prefix: string; folders: string[]; files: { key: string; bytes: number }[]; nextToken: string | null };
const demo: Listing = { prefix: "replays/2026/09/25/", folders: [], files: [
  { key: "replays/2026/09/25/9015934336.dem.bz2", bytes: 57664943 },
  { key: "replays/2026/09/25/9013078038_724775528.dem.bz2", bytes: 108902277 },
], nextToken: null };
function parent(prefix: string) { const parts = prefix.replace(/\/$/, "").split("/"); return parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "replays/"; }
export default function AdminReplayArchive({ previewMode = false }: { previewMode?: boolean }) {
  const [prefix, setPrefix] = useState(previewMode ? demo.prefix : "replays/");
  const [listing, setListing] = useState<Listing | null>(previewMode ? demo : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (folder: string, append = false, token?: string) => {
    if (previewMode) { setPrefix(folder); setListing({ ...demo, prefix: folder }); return; }
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ prefix: folder });
      if (token) query.set("token", token);
      const response = await fetch(`/api/admin/replay-archive?${query}`, { cache: "no-store" });
      const body = await response.json() as Listing & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "فهرست Replay دریافت نشد");
      setPrefix(folder);
      setListing((current) => append && current && current.prefix === folder ? { ...body, folders: [...current.folders, ...body.folders], files: [...current.files, ...body.files] } : body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "فهرست Replay دریافت نشد"); }
    finally { setBusy(false); }
  }, [previewMode]);
  useEffect(() => { if (!previewMode) void load("replays/"); }, [load, previewMode]);
  async function remove(target: { key?: string; prefix?: string }) {
    const label = target.key || target.prefix || "";
    if (!window.confirm(target.prefix ? `کل فایل‌های پوشهٔ ${label} و زیرپوشه‌ها پاک شوند؟` : `فایل ${label} پاک شود؟`)) return;
    if (previewMode) { setListing((current) => current && target.key ? { ...current, files: current.files.filter((file) => file.key !== target.key) } : { ...demo, prefix, files: [], folders: [] }); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/replay-archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "حذف Replay انجام نشد");
      await load(prefix);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "حذف Replay انجام نشد؛ فهرست را تازه کنید"); }
    finally { setBusy(false); }
  }
  return <section className="admin-section replay-admin-section">
    <header className="admin-section-header"><div><p className="week-kicker">REPLAY ARCHIVE</p><h2>فایل‌های Replay در پارس‌پک</h2></div><button className="secondary-button" type="button" disabled={busy} onClick={() => void load(prefix)}>تازه‌سازی</button></header>
    <nav aria-label="مسیر آرشیو Replay"><button type="button" disabled={busy || prefix === "replays/"} onClick={() => void load(parent(prefix))}>پوشهٔ بالاتر</button> <span dir="ltr">{prefix}</span></nav>
    {error && <p role="alert" className="replay-page-error">{error}</p>}
    {listing && <div className="replay-admin-list">
      {listing.folders.map((folder) => <div key={folder}><button type="button" disabled={busy} onClick={() => void load(folder)}><Folder size={18} /> {folder.slice(prefix.length)}</button><button aria-label={`حذف پوشه ${folder}`} type="button" disabled={busy} onClick={() => void remove({ prefix: folder })}><Trash2 size={18} /></button></div>)}
      {listing.files.map((file) => <div key={file.key}><span><FileArchive size={18} /> {file.key.slice(prefix.length)} · {(file.bytes / 1048576).toFixed(1)} MB</span><button aria-label={`حذف فایل ${file.key}`} type="button" disabled={busy} onClick={() => void remove({ key: file.key })}><Trash2 size={18} /></button></div>)}
      {!listing.folders.length && !listing.files.length && <p>فایلی در این پوشه نیست.</p>}
      {listing.nextToken && <button className="secondary-button" type="button" disabled={busy} onClick={() => void load(prefix, true, listing.nextToken || undefined)}>نمایش موارد بیشتر</button>}
    </div>}
  </section>;
}
