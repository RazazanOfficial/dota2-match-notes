import { useEffect, useState } from "react";
import { Check, Copy, UserRound } from "lucide-react";
import { toJournalDateKey } from "@/lib/date";
import { SAMPLE_DATE } from "../history";
import type { Session } from "@/lib/types";
import type { Messages } from "../i18n";
export const previewProfile: Session = { mode: "player", username: "MeriJ", displayName: "MeriJ", avatarUrl: null, registeredDate: "2026-09-15" };
export function profileRegistrationDate(session: Session): string {
    if (session.registeredDate && /^\d{4}-\d{2}-\d{2}$/.test(session.registeredDate)) return session.registeredDate;
    const date = new Date(session.createdAt || session.registeredDate || "");
    return Number.isNaN(date.getTime()) ? SAMPLE_DATE : toJournalDateKey(date);
}

export function Avatar({ session }: {
    session: Session;
}) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [session.avatarUrl]);
    return <span className="avatar">{session.avatarUrl && !failed ? <img src={session.avatarUrl} alt={session.displayName || session.username} onError={() => setFailed(true)}/> : <UserRound size={23} aria-hidden="true"/>}</span>;
}
export function CopyValue({ value, label, t, className = "" }: {
    value: string;
    label?: string;
    t: Messages;
    className?: string;
}) {
    const [state, setState] = useState<"idle" | "copied" | "error">("idle");
    async function copy() {
        try {
            try {
                await navigator.clipboard.writeText(value);
            }
            catch {
                const previous = document.activeElement as HTMLElement | null;
                const field = document.createElement("textarea");
                field.value = value;
                field.setAttribute("readonly", "");
                field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
                document.body.append(field);
                field.select();
                try {
                    if (!document.execCommand("copy"))
                        throw new Error("Clipboard unavailable");
                }
                finally {
                    field.remove();
                    previous?.focus();
                }
            }
            setState("copied");
        }
        catch {
            setState("error");
        }
    }
    return <button className={`copy-value ${className}`} title={state === "error" ? t.copyError : t.copy} aria-label={`${t.copy} ${label || value}`} onClick={copy}>
    <bdi>{value}</bdi>{state === "copied" ? <Check size={13}/> : <Copy size={13}/>}<span className="sr-only" role="status">{state === "copied" ? t.copied : state === "error" ? t.copyError : ""}</span>
  </button>;
}
