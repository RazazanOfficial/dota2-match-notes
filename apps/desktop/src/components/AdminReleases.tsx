import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Heading2, List, ListOrdered, Quote, RefreshCw } from "lucide-react";
import type { Messages } from "../i18n";
import { apiRequest } from "../api";
import { adminStatus, adminText, useAccountRead } from "../admin";
import { ErrorNotice } from "./ErrorNotice";
import { AdminReadState, SuccessNotice, mutationResult } from "./AdminShared";
interface Release {id:string;version:string;title:string;summary:string;content:Record<string,unknown>;status:"draft"|"published"}
const empty = {type:"doc",content:[{type:"paragraph"}]};
export function AdminReleases({ t }: {t:Messages}) {
  const read = useAccountRead<{releases:Release[]}>("/api/admin/releases",true);
  const [selected,setSelected] = useState("new"), [version,setVersion] = useState(""), [title,setTitle] = useState(""), [summary,setSummary] = useState(""), [status,setStatus] = useState<"draft"|"published">("draft");
  const [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(null), [notice,setNotice] = useState(""), [confirmPublish,setConfirmPublish] = useState(false);
  const editor = useEditor({extensions:[StarterKit],content:empty,immediatelyRender:false,editorProps:{attributes:{class:"admin-release-editor","aria-label":adminText(t,"متن انتشار","Release content")}}});
  useEffect(()=>{editor?.setOptions({editorProps:{attributes:{class:"admin-release-editor","aria-label":adminText(t,"متن انتشار","Release content")}}});},[editor,t]);
  function select(id:string) {
    const release = read.data?.releases.find(r=>r.id === id);
    setSelected(id);setVersion(release?.version || "");setTitle(release?.title || "");setSummary(release?.summary || "");setStatus(release?.status || "draft");editor?.commands.setContent(release?.content || empty);setNotice("");setError(null);setConfirmPublish(false);
  }
  async function save() {
    if (!editor) return;
    setBusy(true);setError(null);setNotice("");
    try {
      const result = await apiRequest<{release:Release}>(selected === "new" ? "/api/admin/releases" : `/api/admin/releases/${encodeURIComponent(selected)}`,{method:selected === "new" ? "POST" : "PUT",body:JSON.stringify({version,title,summary,status,content:editor.getJSON()})});
      setSelected(result.release.id);setConfirmPublish(false);setNotice(mutationResult(t));read.refresh();
    } catch(failure) {setError(failure);} finally {setBusy(false);}
  }
  return <section className="panel account-section"><div className="section-heading"><h2>{adminText(t,"یادداشت انتشارها","Release notes")}</h2><button className="secondary-button" disabled={read.busy} onClick={read.refresh}><RefreshCw size={16}/>{t.refresh}</button></div><AdminReadState error={read.error} busy={read.busy} hasData={!!read.data} t={t}/>
    <form className="admin-form" onSubmit={event=>{event.preventDefault();void save();}}><label>{adminText(t,"انتخاب نسخه","Select release")}<select value={selected} disabled={busy} onChange={event=>select(event.target.value)}><option value="new">{adminText(t,"نسخه جدید","New release")}</option>{read.data?.releases.map(release=><option key={release.id} value={release.id}>{release.version} · {release.title} · {adminStatus(release.status,t)}</option>)}</select></label><div className="admin-field-grid"><label>{adminText(t,"شماره نسخه","Version")}<input dir="ltr" maxLength={32} pattern="[a-zA-Z0-9._-]+" value={version} onChange={event=>setVersion(event.target.value)} required/></label><label>{adminText(t,"عنوان","Title")}<input maxLength={160} value={title} onChange={event=>setTitle(event.target.value)} required/></label></div><label>{adminText(t,"خلاصه","Summary")}<input maxLength={500} value={summary} onChange={event=>setSummary(event.target.value)}/></label>
    <div className="admin-editor-toolbar" role="toolbar" aria-label={adminText(t,"ویرایش متن","Text formatting")}>{[
      {label:adminText(t,"درشت","Bold"),icon:Bold,active:editor?.isActive("bold"),run:()=>editor?.chain().focus().toggleBold().run()},
      {label:adminText(t,"مورب","Italic"),icon:Italic,active:editor?.isActive("italic"),run:()=>editor?.chain().focus().toggleItalic().run()},
      {label:adminText(t,"تیتر","Heading"),icon:Heading2,active:editor?.isActive("heading",{level:2}),run:()=>editor?.chain().focus().toggleHeading({level:2}).run()},
      {label:adminText(t,"فهرست","Bullet list"),icon:List,active:editor?.isActive("bulletList"),run:()=>editor?.chain().focus().toggleBulletList().run()},
      {label:adminText(t,"فهرست شماره‌دار","Numbered list"),icon:ListOrdered,active:editor?.isActive("orderedList"),run:()=>editor?.chain().focus().toggleOrderedList().run()},
      {label:adminText(t,"نقل قول","Quote"),icon:Quote,active:editor?.isActive("blockquote"),run:()=>editor?.chain().focus().toggleBlockquote().run()},
    ].map(({label,icon:Icon,active,run})=><button type="button" key={label} aria-label={label} aria-pressed={Boolean(active)} onClick={run}><Icon size={18}/></button>)}</div><EditorContent editor={editor}/><label>{adminText(t,"وضعیت","Status")}<select value={status} onChange={event=>{setStatus(event.target.value as "draft"|"published");setConfirmPublish(false);}}><option value="draft">{adminStatus("draft",t)}</option><option value="published">{adminStatus("published",t)}</option></select></label>
    {status === "published" && <label className="admin-check"><input type="checkbox" checked={confirmPublish} onChange={event=>setConfirmPublish(event.target.checked)}/>{adminText(t,"انتشار عمومی این یادداشت را تأیید می‌کنم.","I confirm publishing these release notes publicly.")}</label>}{!!error && <ErrorNotice error={error} t={t}/>}<SuccessNotice text={notice}/><button className="primary-button" disabled={busy || !editor || !version.trim() || !title.trim() || status === "published" && !confirmPublish}>{busy ? t.checking : adminText(t,"ذخیره نسخه","Save release")}</button></form>
  </section>;
}
