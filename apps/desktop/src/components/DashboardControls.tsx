import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Layers, Rows3 } from "lucide-react";
import { buildPersianCalendarMonth } from "@/lib/persian-calendar";
import type { Session } from "@/lib/types";
import { periodRange, SAMPLE_DATE, type Period } from "../history";
import { isPersian, type Messages } from "../i18n";
import { Calendar, trackingStart } from "./Calendar";
import { Avatar, previewProfile, profileRegistrationDate } from "./Shared";

type ControlsProps = {
    period: Period; setPeriod: (period: Period) => void; anchor: string; setAnchor: (date: string) => void;
    t: Messages; registration?: string; maxDate?: string; compact?: boolean;
};
export function PeriodControls({ period, setPeriod, anchor, setAnchor, t, registration = previewProfile.registeredDate!, maxDate = SAMPLE_DATE }: ControlsProps) {
    const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
    const min = trackingStart(registration), range = periodRange(period, anchor);
    const from = range.from < min ? min : range.from, to = range.to > maxDate ? maxDate : range.to;
    const format = (date: string) => new Intl.DateTimeFormat(isPersian(t) ? "fa-IR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
    function choose(date: string) { setAnchor(date < min ? min : date > maxDate ? maxDate : date); close(true); }
    function move(direction: number) {
        if (period === "month") { const month = buildPersianCalendarMonth(anchor); choose(direction < 0 ? month.previousCursor : month.nextCursor); }
        else { const date = new Date(`${anchor}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 7 * direction); choose(date.toISOString().slice(0, 10)); }
    }
    useEffect(() => {
        if (!open) return;
        const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(true); } };
        const frame = window.setTimeout(() => root.current?.querySelector<HTMLButtonElement>('.calendar-popover button[aria-pressed="true"]')?.focus());
        window.addEventListener("mousedown", outside); window.addEventListener("keydown", escape);
        return () => { window.clearTimeout(frame); window.removeEventListener("mousedown", outside); window.removeEventListener("keydown", escape); };
    }, [open]);
    return <div className="period-toolbar dashboard-period-controls" ref={root}>
        <div className="segmented period-choice" role="group" aria-label={t.period}>{(["week", "month"] as const).map(value => <button key={value} aria-pressed={value === period} className={value === period ? "active" : ""} onClick={() => { setPeriod(value); close(); }}>{value === "week" ? <Rows3 size={16}/> : <Layers size={16}/>}<span>{value === "week" ? t.weekly : t.monthly}</span></button>)}</div>
        <div className="period-range dashboard-range"><button aria-label={t.previous} disabled={range.from <= min} onClick={() => move(-1)}>{isPersian(t) ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button><button ref={trigger} className="date-trigger" aria-label={t.selectedDate} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}><CalendarDays size={18}/><span><small>{t.chooseRange}</small><bdi>{format(from)} — {format(to)}</bdi></span><ChevronDown size={14}/></button><button aria-label={t.next} disabled={range.to >= maxDate} onClick={() => move(1)}>{isPersian(t) ? <ChevronLeft size={17}/> : <ChevronRight size={17}/>}</button></div>
        {open && <div className="calendar-popover dashboard-calendar" role="dialog" aria-label={t.chooseRange}><p>{period === "week" ? t.weekRangeHint : t.monthRangeHint}</p><Calendar key={anchor} value={anchor} scope={period} min={min} max={maxDate} t={t} onChange={choose}/><button className="period-current" onClick={() => choose(maxDate)}>{period === "week" ? t.currentWeek : t.currentMonth}</button></div>}
    </div>;
}
export function DashboardHeader({ session, onFetch, ...controls }: ControlsProps & { session: Session; onFetch: () => void }) {
    return <section className="panel profile-banner dashboard-banner"><div className="dashboard-identity"><Avatar session={session}/><div><p className="eyebrow">{controls.t.playerWorkspace}</p><h1><bdi>{session.displayName || session.username}</bdi></h1></div></div><div className="profile-period"><PeriodControls {...controls} registration={profileRegistrationDate(session)}/></div><button className="primary-button dashboard-fetch" onClick={onFetch}><span className="fetch-symbol"><Download size={18}/></span><span>{controls.t.fetchMatches}</span><span className="fetch-indicator" aria-hidden="true"/></button></section>;
}
