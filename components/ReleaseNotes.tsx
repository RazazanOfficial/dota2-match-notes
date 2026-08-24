"use client";

import { useEffect, useState } from "react";
import TiptapDocument from "./TiptapDocument";

interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  summary: string;
  content: Record<string, unknown>;
  publishedAt: string | null;
}

const LAST_SEEN_KEY = "dota-notes:last-seen-release";

export default function ReleaseNotes({ authenticated = false, compact = false }: { authenticated?: boolean; compact?: boolean }) {
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/releases", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then((body: { releases?: ReleaseNote[]; latestReleaseId?: string | null; hasUnread?: boolean }) => {
        if (cancelled) return;
        const next = body.releases || [];
        const latest = body.latestReleaseId || next[0]?.id || null;
        setReleases(next);
        setLatestId(latest);
        setSelectedId(latest);
        const locallySeen = latest && window.localStorage.getItem(LAST_SEEN_KEY) === latest;
        setUnread(authenticated ? Boolean(latest && body.hasUnread) : Boolean(latest && !locallySeen));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authenticated]);

  async function showReleases() {
    setOpen(true);
    setSelectedId((current) => current || latestId);
    if (!latestId) return;
    window.localStorage.setItem(LAST_SEEN_KEY, latestId);
    setUnread(false);
    if (authenticated) {
      await fetch(`/api/releases/${latestId}/read`, { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    }
  }

  const selected = releases.find((release) => release.id === selectedId) || releases[0];

  return (
    <>
      <button className={`site-version${compact ? " is-compact" : ""}`} type="button" onClick={showReleases}>
        <span lang="en">version-3.0.0</span>
        {unread && <i aria-label="نسخه جدید" />}
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="modal release-notes-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <div><p className="modal-kicker" lang="en">BATTLE REPORT</p><h2>تغییرات نسخه‌ها</h2></div>
              <button className="close-button" type="button" onClick={() => setOpen(false)} aria-label="بستن">×</button>
            </header>
            {releases.length ? (
              <div className="release-notes-layout">
                <nav aria-label="نسخه‌های قبلی">
                  {releases.map((release) => (
                    <button className={release.id === selected?.id ? "is-active" : ""} type="button" key={release.id} onClick={() => setSelectedId(release.id)}>
                      <b lang="en">{release.version}</b><span>{release.title}</span>
                    </button>
                  ))}
                </nav>
                {selected && <article><header><span lang="en">PATCH {selected.version}</span><h3>{selected.title}</h3><p>{selected.summary}</p></header><TiptapDocument document={selected.content} /></article>}
              </div>
            ) : <div className="release-empty">هنوز یادداشت نسخه‌ای منتشر نشده است.</div>}
          </section>
        </div>
      )}
    </>
  );
}
