"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, List, Quote, Save } from "lucide-react";
import { toast } from "react-toastify";
import DotaSelect from "./DotaSelect";

interface AdminRelease {
  id: string;
  version: string;
  title: string;
  summary: string;
  content: Record<string, unknown>;
  status: "draft" | "published";
}

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export default function AdminReleaseNotes() {
  const [releases, setReleases] = useState<AdminRelease[]>([]);
  const [selectedId, setSelectedId] = useState<string>("new");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [busy, setBusy] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit],
    content: EMPTY_DOC,
    immediatelyRender: false,
  });

  async function load() {
    const response = await fetch("/api/admin/releases", { cache: "no-store" });
    const body = await response.json() as { releases?: AdminRelease[] };
    if (response.ok) setReleases(body.releases || []);
  }
  useEffect(() => { void load(); }, []);

  function select(releaseId: string) {
    setSelectedId(releaseId);
    const release = releases.find((item) => item.id === releaseId);
    setVersion(release?.version || "");
    setTitle(release?.title || "");
    setSummary(release?.summary || "");
    setStatus(release?.status || "draft");
    editor?.commands.setContent(release?.content || EMPTY_DOC);
  }

  async function save() {
    if (!editor || !version.trim() || !title.trim()) return;
    setBusy(true);
    try {
      const url = selectedId === "new" ? "/api/admin/releases" : `/api/admin/releases/${selectedId}`;
      const response = await fetch(url, {
        method: selectedId === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, title, summary, status, content: editor.getJSON() }),
      });
      const body = await response.json() as { release?: AdminRelease; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "ثبت نسخه انجام نشد");
      await load();
      if (body.release) setSelectedId(body.release.id);
      toast.success(status === "published" ? "نسخه منتشر شد" : "پیش‌نویس ذخیره شد");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "ثبت نسخه انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section admin-release-section">
      <header className="admin-section-header">
        <div><p className="week-kicker">RELEASE NOTES</p><h2>یادداشت نسخه‌ها</h2></div>
        <DotaSelect<string>
          label="انتخاب نسخه"
          value={selectedId}
          placeholder="نسخه جدید"
          options={[{ value: "new", label: "نسخه جدید" }, ...releases.map((release) => ({ value: release.id, label: `${release.version} · ${release.title}` }))]}
          onChange={select}
        />
      </header>
      <div className="release-editor-fields">
        <label><span>نسخه</span><input lang="en" dir="ltr" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="3.0.0" /></label>
        <label><span>عنوان</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="field-wide"><span>خلاصه</span><input value={summary} maxLength={500} onChange={(event) => setSummary(event.target.value)} /></label>
      </div>
      <div className="tiptap-toolbar" dir="ltr">
        <button className={editor?.isActive("bold") ? "is-active" : ""} type="button" onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="درشت"><Bold aria-hidden="true" /></button>
        <button className={editor?.isActive("heading", { level: 2 }) ? "is-active" : ""} type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="تیتر"><Heading2 aria-hidden="true" /></button>
        <button className={editor?.isActive("bulletList") ? "is-active" : ""} type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="فهرست"><List aria-hidden="true" /></button>
        <button className={editor?.isActive("blockquote") ? "is-active" : ""} type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} aria-label="نقل قول"><Quote aria-hidden="true" /></button>
      </div>
      <EditorContent className="release-tiptap" editor={editor} />
      <footer className="release-editor-actions">
        <DotaSelect<"draft" | "published">
          label="وضعیت"
          value={status}
          placeholder="وضعیت"
          options={[{ value: "draft", label: "پیش‌نویس" }, { value: "published", label: "انتشار" }]}
          onChange={setStatus}
        />
        <button className="primary-button" type="button" disabled={busy} onClick={save}><Save aria-hidden="true" /> {busy ? "در حال ثبت" : "ذخیره نسخه"}</button>
      </footer>
    </section>
  );
}
