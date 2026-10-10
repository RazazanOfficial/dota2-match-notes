import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, BookOpen, ImageOff, Play } from "lucide-react";
import { isPersian, type Messages } from "../i18n";
import { CopyValue } from "./Shared";
import { Modal } from "./Workspace";

type TutorialKind = "folder" | "playback";
const folderSteps = [
    ["کتابخانهٔ استیم را باز کن", "Open your Steam library"],
    ["پوشهٔ دوتا ۲ را پیدا کن", "Find your Dota 2 folder"],
    ["آدرس پوشه را کپی کن", "Copy the folder path"],
    ["انتخاب پوشه را باز کن", "Open the folder picker"],
    ["آدرس را وارد کن", "Paste the folder path"],
    ["پوشه را تأیید کن", "Confirm the folder"],
] as const;
const playbackSteps = [
    folderSteps[0],
    ["تنظیمات دوتا ۲ را باز کن", "Open Dota 2 properties"],
    ["کنسول را فعال کن", "Enable the console"],
    ["تنظیم کلید کنسول را پیدا کن", "Find the console hotkey"],
    ["یک کلید برای کنسول انتخاب کن", "Set a console hotkey"],
    ["دستور ریپلی را کپی کن", "Copy the replay command"],
    ["ریپلی را اجرا کن", "Play the replay"],
] as const;

function TutorialImage({ src, alt, t }: { src: string; alt: string; t: Messages }) {
    const [missing, setMissing] = useState(false);
    useEffect(() => setMissing(false), [src]);
    return <>{missing
        ? <div className="tutorial-image-pending" role="img" aria-label={t.unavailable}><ImageOff size={32} aria-hidden="true"/></div>
        : <img key={src} src={src} alt={alt} width={1672} height={941} decoding="async" onError={() => setMissing(true)}/>}</>;
}

export function ReplaySetupGuide({ t, kind = "folder" }: { t: Messages; kind?: TutorialKind }) {
    const [open, setOpen] = useState(false), [step, setStep] = useState(0);
    const fa = isPersian(t), steps = kind === "folder" ? folderSteps : playbackSteps, text = steps[step];
    const title = kind === "folder" ? (fa ? "راهنمای انتخاب پوشهٔ دوتا" : "Dota folder setup guide") : (fa ? "راهنمای اجرای ریپلی" : "How to play a replay");
    const category = kind === "folder" || step === 0 ? "replay-folder" : "replay-playback";
    const src = `${import.meta.env.BASE_URL}tutorials/${category}/${fa ? "fa" : "en"}/step-${String(step + 1).padStart(2, "0")}.png`;
    useEffect(() => {
        if (!open) return;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = overflow; };
    }, [open]);
    return <><button className="setup-guide-trigger" onClick={() => { setStep(0); setOpen(true); }}>
        {kind === "folder" ? <BookOpen size={16}/> : <Play size={16}/>}{kind === "folder" ? (fa ? "راهنمای انتخاب پوشه" : "Folder setup guide") : (fa ? "آموزش اجرای ریپلی" : "Play a replay guide")}
    </button>{open && createPortal(<Modal title={title} closeLabel={t.close} className="replay-tutorial-modal" onClose={() => setOpen(false)}>
        <div className="replay-setup-guide" dir={fa ? "rtl" : "ltr"}>
            <div className="tutorial-topline"><span className="tutorial-counter">{fa ? "مرحله" : "Step"} <bdi>{step + 1} / {steps.length}</bdi></span>
                <nav className="setup-steps" aria-label={fa ? "مراحل راهنما" : "Guide steps"}>{steps.map((item,index) => <button key={index} className={step === index ? "active" : step > index ? "complete" : ""} aria-current={step === index ? "step" : undefined} aria-label={`${index+1}. ${item[fa ? 0 : 1]}`} onClick={() => setStep(index)}>{index+1}</button>)}</nav>
            </div>
            <div className="tutorial-image-stage">
                <div className="tutorial-image-frame"><TutorialImage src={src} alt={text[fa ? 0 : 1]} t={t}/></div>
                <button className={`tutorial-image-arrow ${fa ? "on-right" : "on-left"}`} aria-label={t.previous} disabled={step === 0} onClick={() => setStep(value => Math.max(0, value-1))}>{fa ? <ChevronRight size={23}/> : <ChevronLeft size={23}/>}</button>
                <button className={`tutorial-image-arrow ${fa ? "on-left" : "on-right"}`} aria-label={t.next} disabled={step === steps.length-1} onClick={() => setStep(value => Math.min(steps.length-1, value+1))}>{fa ? <ChevronLeft size={23}/> : <ChevronRight size={23}/>}</button>
                {kind === "playback" && step === 2 && <div className="tutorial-command"><CopyValue value="-console" t={t}/></div>}
            </div>
        </div>
    </Modal>, document.body)}</>;
}
