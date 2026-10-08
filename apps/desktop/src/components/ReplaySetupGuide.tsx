import { useState } from "react";
import { ArrowLeft, ArrowRight, FolderOpen, BookOpen } from "lucide-react";
import { isPersian, type Messages } from "../i18n";
import { Modal } from "./Workspace";

const steps = [
    ["کتابخانهٔ استیم", "استیم را باز کن و از بالای پنجره وارد LIBRARY شو.", "Steam library", "Open Steam and select LIBRARY at the top of the window."],
    ["پوشهٔ نصب دوتا", "روی Dota 2 راست‌کلیک کن؛ از Manage گزینهٔ Browse local files را بزن.", "Find Dota’s installation", "Right-click Dota 2, then choose Manage → Browse local files."],
    ["کپی آدرس", "در پنجرهٔ بازشده، Ctrl + L را بزن تا آدرس انتخاب شود؛ سپس Ctrl + C را بزن.", "Copy the address", "In File Explorer, press Ctrl + L to select the folder address, then Ctrl + C to copy it."],
    ["بازکردن انتخاب‌گر پوشه", "به بخش ریپلی نرم‌افزار برگرد و دکمهٔ «بازکردن پوشه» را بزن.", "Open the folder picker", "Return to the Replay page and click Open folder."],
    ["واردکردن آدرس", "در انتخاب‌گر پوشه، Ctrl + L و سپس Ctrl + V را بزن. با Enter وارد پوشهٔ نصب شو.", "Paste the address", "In the folder picker, press Ctrl + L, then Ctrl + V. Press Enter to open the installation folder."],
    ["تأیید پوشه", "Select Folder را بزن. نرم‌افزار پوشهٔ game/dota/replays را برای ذخیرهٔ فایل‌های .dem آماده می‌کند.", "Confirm the folder", "Click Select Folder. The app prepares game/dota/replays for your .dem files."],
] as const;

// Redrawn instructional illustrations: no personal account details or large
// screenshot downloads, and Steam/Windows control labels stay recognizable.
export function SetupIllustration({ step, label }: { step: number; label: string }) {
    const steam = step < 2, picker = step > 3;
    const focus = [[182, 21, 113, 32], [291, 152, 244, 36], [69, 60, 452, 34], [337, 113, 190, 43], [69, 60, 452, 34], [361, 226, 167, 35]][step];
    return <svg className="setup-illustration" viewBox="0 0 570 290" role="img" aria-label={label}>
        <rect x="2" y="2" width="566" height="286" rx="14" fill={steam ? "#182230" : "#18212e"} stroke="#38485d"/>
        <path d="M2 44H568" stroke="#38485d"/>
        <g fill="#dde6f3" fontFamily="system-ui,sans-serif" fontSize="13">
            <text x="23" y="30">{steam ? "STEAM" : step === 3 ? "DOTA NOTES · REPLAY" : picker ? "Select Dota 2 installation" : "File Explorer"}</text>
            <text x="522" y="30">— ×</text>
            {steam ? <>
                <text x="118" y="42">STORE</text><text x="192" y="42" fontWeight="700">LIBRARY</text>
                <rect x="15" y="64" width="158" height="209" rx="5" fill="#101a26"/>
                <text x="28" y="88" fill="#8ea0b5">GAMES</text><rect x="22" y="105" width="144" height="35" rx="4" fill="#29435b"/>
                <text x="36" y="127">Dota 2</text><rect x="187" y="64" width="366" height="111" rx="6" fill="#293540"/>
                <path d="M317 82l68 11-12 63-66-13z M327 97l32 35 M359 103l-29 24" stroke="#da715c" strokeWidth="9"/>
                <rect x="190" y="197" width="102" height="35" rx="5" fill="#387245"/><text x="225" y="220">PLAY</text>
                {step === 1 && <><rect x="136" y="111" width="154" height="146" rx="5" fill="#2b3b4e" stroke="#50637b"/><text x="149" y="137">Play</text><text x="149" y="165">Manage ›</text><text x="149" y="197">Properties…</text><rect x="288" y="147" width="250" height="97" rx="5" fill="#2b3b4e" stroke="#50637b"/><text x="303" y="175" fontWeight="600">Browse local files</text><text x="303" y="211">Uninstall</text></>}
            </> : step === 3 ? <>
                <text x="25" y="83" fill="#8ea0b5">REPLAY LOCATION</text><rect x="22" y="105" width="526" height="71" rx="9" fill="#222f40" stroke="#405269"/>
                <text x="39" y="133" fontWeight="600">Dota 2 installation</text><text x="39" y="156" fill="#9daec3">Choose your game folder</text>
                <rect x="340" y="116" width="184" height="37" rx="7" fill="#32485b"/><text x="382" y="140">Open folder</text>
                <text x="26" y="214">Find a replay</text><text x="206" y="214" fill="#8ea0b5">Downloaded replays</text>
            </> : <>
                <text x="25" y="82">← ↑</text><rect x="72" y="63" width="446" height="28" rx="4" fill="#26384d"/>
                <text x="83" y="81" fontSize="12">E:\Steam\steamapps\common\dota 2 beta</text>
                <path d="M151 103V210" stroke="#38485d"/><text x="22" y="127" fill="#98acc3">This PC</text><text x="22" y="155" fill="#98acc3">Local Disk (E:)</text>
                <text x="174" y="126">Name</text><text x="183" y="155">▰ game</text><text x="183" y="182">▰ EmptySteamDepot</text>
                <path d="M14 212H552" stroke="#38485d"/>
                {picker ? <><rect x="365" y="230" width="160" height="27" rx="4" fill="#324e6e"/><text x="398" y="249">Select Folder</text><text x="281" y="249" fill="#98acc3">Cancel</text></> : <text x="22" y="248" fill="#98acc3">2 folders · Dota 2 installation</text>}
            </>}
        </g>
        <rect x={focus[0]} y={focus[1]} width={focus[2]} height={focus[3]} rx="6" fill="#60d7bd" fillOpacity=".08" stroke="#70edd2" strokeWidth="2"/>
        <circle cx={focus[0]+focus[2]-4} cy={focus[1]-1} r="13" fill="#70edd2" stroke="#182230" strokeWidth="3"/>
        <text x={focus[0]+focus[2]-4} y={focus[1]+4} textAnchor="middle" fontFamily="system-ui" fontWeight="700" fontSize="13" fill="#102b28">{step+1}</text>
        {(step === 2 || step === 4) && <g><rect x="176" y="222" width="175" height="36" rx="7" fill="#26384d" stroke="#50637b"/><text x="264" y="246" textAnchor="middle" fill="#e4eef9" fontFamily="system-ui" fontSize="14">{step === 2 ? "Ctrl + L → Ctrl + C" : "Ctrl + V → Enter"}</text></g>}
    </svg>;
}

export function ReplaySetupGuide({ t, onChoose, disabled }: { t: Messages; onChoose: () => void; disabled: boolean }) {
    const [open, setOpen] = useState(false), [step, setStep] = useState(0);
    const fa = isPersian(t), text = steps[step], title = fa ? "راهنمای انتخاب پوشهٔ دوتا" : "Dota folder setup guide";
    return <><button className="secondary-button setup-guide-trigger" onClick={()=>setOpen(true)}><BookOpen size={16}/>{fa ? "راهنمای تصویری" : "Visual guide"}</button>{open && <Modal title={title} onClose={()=>setOpen(false)}>
        <div className="replay-setup-guide" dir={fa ? "rtl" : "ltr"}>
            <nav className="setup-steps" aria-label={fa ? "مراحل راهنما" : "Guide steps"}>{steps.map((item,index)=><button key={index} className={step===index ? "active" : step>index ? "complete" : ""} aria-current={step===index ? "step" : undefined} aria-label={`${index+1}. ${item[fa ? 0 : 2]}`} onClick={()=>setStep(index)}>{index+1}</button>)}</nav>
            <SetupIllustration step={step} label={text[fa ? 0 : 2]}/>
            <div className="setup-caption"><span>{step+1} / 6</span><h3>{text[fa ? 0 : 2]}</h3><p>{text[fa ? 1 : 3]}</p></div>
            <footer><button className="secondary-button" disabled={step===0} onClick={()=>setStep(value=>value-1)}>{fa ? <ArrowRight size={16}/> : <ArrowLeft size={16}/>} {t.previous}</button>{step<5 ? <button className="primary-button" onClick={()=>setStep(value=>value+1)}>{t.next}{fa ? <ArrowLeft size={16}/> : <ArrowRight size={16}/>}</button> : <button className="primary-button" disabled={disabled} onClick={()=>{setOpen(false);onChoose();}}><FolderOpen size={16}/>{fa ? "بازکردن پوشه" : "Open folder"}</button>}</footer>
        </div>
    </Modal>}</>;
}
