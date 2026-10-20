import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { Session } from "@/lib/types";
import { periodRange, SAMPLE_DATE, type Period } from "../history";
import { isPersian, type Messages } from "../i18n";
import { periodDayLabel, periodMonth, periodMonthLabel, periodMonthsInYear, periodWeeksInMonth, persianPeriodParts, shiftPeriodMonth } from "../historyPeriodPicker";
import { trackingStart } from "./Calendar";
import { Avatar, previewProfile, profileRegistrationDate } from "./Shared";

type ControlsProps = {
    period: Period; setPeriod: (period: Period) => void; anchor: string; setAnchor: (date: string) => void;
    t: Messages; registration?: string; maxDate?: string; compact?: boolean;
};
export function PeriodControls({ period, setPeriod, anchor, setAnchor, t, registration = previewProfile.registeredDate!, maxDate = SAMPLE_DATE }: ControlsProps) {
    const [open, setOpen] = useState(false), [cursor, setCursor] = useState(anchor);
    const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
    const min = trackingStart(registration), range = periodRange(period, anchor), fa = isPersian(t);
    const month = useMemo(() => periodMonth(anchor), [anchor]);
    const months = useMemo(() => open ? periodMonthsInYear(cursor) : [], [cursor,open]);
    const weeks = useMemo(() => periodWeeksInMonth(anchor,min,maxDate), [anchor,min,maxDate]);
    const pickerWeeks = useMemo(() => open && period === "week" ? periodWeeksInMonth(cursor,min,maxDate) : [], [cursor,min,maxDate,open,period]);
    const recent = useMemo(() => {
        if(period!=="month") return [];
        const items=Array.from({length:4},(_,index)=>periodMonth(shiftPeriodMonth(maxDate,index-3))).filter(item=>item.lastKey>=min);
        if(!items.some(item=>item.firstKey===month.firstKey) && month.lastKey>=min && month.firstKey<=maxDate) items.splice(0,1,month);
        return items;
    },[maxDate,min,period,month]);
    const numbers = useMemo(() => new Intl.NumberFormat(fa ? "fa-IR" : "en-US",{useGrouping:false}),[fa]);
    const number = (value:number) => numbers.format(value);
    const activeWeek = weeks.find(week => periodRange("week",week.anchor).from === range.from);
    function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus(); }
    function choose(date: string) { setAnchor(date < min ? min : date > maxDate ? maxDate : date); close(true); }
    function openPicker() { setCursor(anchor); setOpen(value=>!value); }
    useEffect(() => {
        if (!open) return;
        const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(true); } };
        const frame = window.setTimeout(() => (panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not([disabled])') || panel.current?.querySelector<HTMLButtonElement>('button:not([disabled])'))?.focus(),0);
        window.addEventListener("mousedown",outside); window.addEventListener("keydown",escape);
        return () => { window.clearTimeout(frame); window.removeEventListener("mousedown",outside); window.removeEventListener("keydown",escape); };
    }, [open]);
    const weekButton = (week: typeof weeks[number], inPicker = false) => {
        const pressed = period === "week" && week.enabled && periodRange("week",week.anchor).from === range.from;
        return <button type="button" key={week.index} disabled={!week.enabled} aria-pressed={pressed} className={`period-week ${pressed ? "active" : ""}`} aria-label={`${t.week} ${number(week.index)}: ${week.from} — ${week.to}`} onClick={() => choose(week.anchor)}><span>{t.week} {number(week.index)}{inPicker && pressed && <Check size={13}/>}</span><bdi>{week.enabled ? `${periodDayLabel(week.from,t)} – ${periodDayLabel(week.to,t)}` : "—"}</bdi><i aria-hidden="true"/></button>;
    };
    return <div className="period-toolbar timeline-controls" ref={root}>
        <div className="timeline-heading"><div className="timeline-tabs" role="group" aria-label={t.period}>{(["week","month"] as const).map(value=><button type="button" key={value} aria-label={value === "week" ? t.weekly : t.monthly} aria-pressed={value===period} className={value===period ? "active" : ""} onClick={()=>{setPeriod(value);close();}}>{value === "week" ? t.weekly : t.monthly}<i aria-hidden="true"/></button>)}</div><button type="button" ref={trigger} className="timeline-month" aria-label={t.selectedDate} aria-haspopup="dialog" aria-expanded={open} onClick={openPicker}><strong>{periodMonthLabel(anchor,t,true)}</strong><ChevronDown size={16}/></button><small className="timeline-context">{period === "month" ? t.wholeMonth : `${t.week} ${number(activeWeek?.index || 1)}`}</small></div>
        <div className="timeline-strip" role="group" aria-label={period === "week" ? t.chooseWeek : t.chooseMonth}>{period === "week" ? weeks.map(week=>weekButton(week)) : recent.map(item=><button type="button" key={item.firstKey} aria-label={periodMonthLabel(item.firstKey,t,true)} aria-pressed={item.firstKey===month.firstKey} className={`period-month-chip ${item.firstKey===month.firstKey ? "active" : ""}`} onClick={()=>choose(item.firstKey<min ? min : item.firstKey)}><span>{periodMonthLabel(item.firstKey,t)}</span><i aria-hidden="true"/></button>)}</div>
        {open && <div ref={panel} className="period-explorer" role="dialog" aria-label={t.chooseRange}><header><div><small>{t.chooseRange}</small><strong>{periodMonthLabel(cursor,t,true)}</strong></div><button type="button" aria-label={t.close} onClick={()=>close(true)}><X size={17}/></button></header><div className="period-year"><button type="button" aria-label={t.previousYear} disabled={persianPeriodParts(cursor).year<=persianPeriodParts(min).year} onClick={()=>setCursor(shiftPeriodMonth(cursor,-12))}>{fa ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button><strong>{number(persianPeriodParts(cursor).year)}</strong><button type="button" aria-label={t.nextYear} disabled={persianPeriodParts(cursor).year>=persianPeriodParts(maxDate).year} onClick={()=>setCursor(shiftPeriodMonth(cursor,12))}>{fa ? <ChevronLeft size={17}/> : <ChevronRight size={17}/>}</button></div><div className="period-month-grid" role="group" aria-label={t.chooseMonth}>{months.map(item=>{
            const pressed=period==="month" ? item.firstKey===month.firstKey : item.firstKey===periodMonth(cursor).firstKey;
            return <button type="button" key={item.firstKey} aria-label={periodMonthLabel(item.firstKey,t,true)} aria-pressed={pressed} disabled={item.lastKey<min || item.firstKey>maxDate} onClick={()=>{if(period==="month") choose(item.firstKey<min?min:item.firstKey); else setCursor(item.firstKey);}}><span>{periodMonthLabel(item.firstKey,t)}</span><small lang="en" dir="ltr">{new Intl.DateTimeFormat("en-US",{month:"short",timeZone:"UTC"}).format(new Date(`${item.firstKey}T12:00:00Z`))}</small></button>;
        })}</div>{period==="week" && <div className="period-week-picker" role="group" aria-label={t.chooseWeek}>{pickerWeeks.map(week=>weekButton(week,true))}</div>}<footer><small>{period === "week" ? t.chooseWeekHint : t.chooseMonthHint}</small><button type="button" onClick={()=>choose(maxDate)}>{period === "week" ? t.currentWeek : t.currentMonth}</button></footer></div>}
    </div>;
}
export function DashboardHeader({ session, onFetch, ...controls }: ControlsProps & { session: Session; onFetch: () => void }) {
    return <section className="panel profile-banner dashboard-banner"><div className="dashboard-profile-line"><div className="dashboard-identity"><Avatar session={session}/><div><p className="eyebrow">{controls.t.playerWorkspace}</p><h1><bdi>{session.displayName || session.username}</bdi></h1></div></div><button className="primary-button dashboard-fetch" onClick={onFetch}><span className="fetch-symbol"><Download size={18}/></span><span>{controls.t.fetchMatches}</span><span className="fetch-indicator" aria-hidden="true"/></button></div><PeriodControls {...controls} registration={profileRegistrationDate(session)}/></section>;
}
