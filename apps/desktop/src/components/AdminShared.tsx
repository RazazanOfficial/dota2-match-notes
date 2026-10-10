import type { Messages } from "../i18n";
import { useEffect, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Workspace";
import { adminText } from "../admin";
import { ErrorNotice } from "./ErrorNotice";
import { LoadingView } from "./LoadingView";
export function AdminReadState({ error, busy, hasData, t }: { error: unknown; busy: boolean; hasData: boolean; t: Messages }) {
  return <>{!!error && <ErrorNotice error={error} t={t}/>} {busy && !hasData && <LoadingView t={t}/>}</>;
}
export function TelemetryTable({ rows, t }: { rows: Record<string, unknown>[]; t: Messages }) {
  if (!rows.length) return <p className="muted">{t.noData}</p>;
  const keys = [...new Set(rows.flatMap(row=>Object.keys(row)))];
  return <div className="admin-table-scroll"><table className="admin-data-table" dir="ltr"><thead><tr>{keys.map(key=><th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{keys.map(key=><td key={key}>{row[key] == null ? "—" : typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key])}</td>)}</tr>)}</tbody></table></div>;
}
export function SuccessNotice({ text }: { text: string }) { return text ? <p className="admin-success" role="status">{text}</p> : null; }
export const mutationResult = (t: Messages) => adminText(t,"تغییرات ذخیره شد.","Changes saved.");
export function AdminModal(props: ComponentProps<typeof Modal>) {
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, []);
  return createPortal(<Modal {...props}/>, document.body);
}
