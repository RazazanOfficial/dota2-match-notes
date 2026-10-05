import type { Dispatch, SetStateAction } from "react";
import { appearances, themeNames, type Preferences } from "@dota-notes/design-tokens";
import { CURSOR_PACKS, CURSOR_EFFECTS } from "@/lib/cursor-theme";
import { useCursorTheme } from "@/components/CursorThemeProvider";
import type { Messages } from "../i18n";
type Props = {
    preferences: Preferences;
    setPreferences: Dispatch<SetStateAction<Preferences>>;
    t: Messages;
};
export function LanguageSwitch({ preferences, setPreferences, t }: Props) { return <div className="language-switch segmented" role="group" aria-label={t.language}>{([{ language: "fa", flag: "ir", label: "FA" }, { language: "en", flag: "us", label: "EN" }] as const).map(({ language, flag, label }) => <button key={language} aria-label={language === "fa" ? "فارسی" : "English"} aria-pressed={preferences.language === language} className={preferences.language === language ? "active" : ""} onClick={() => setPreferences(p => ({ ...p, language }))}><img src={`/flags/${flag}.svg`} alt={language === "fa" ? "ایران" : "United States"}/>{label}</button>)}</div>; }
export function PreferenceControls({ preferences, setPreferences, t }: Props) { return <div className="settings-fields"><label className="field-label">{t.theme}<select value={preferences.theme} onChange={e => setPreferences(p => ({ ...p, theme: e.target.value as Preferences["theme"] }))}>{themeNames.map(name => <option key={name} value={name}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>)}</select></label><label className="field-label">{t.appearance}<select value={preferences.appearance} onChange={e => setPreferences(p => ({ ...p, appearance: e.target.value as Preferences["appearance"] }))}>{appearances.map(mode => <option key={mode} value={mode}>{t[mode]}</option>)}</select></label></div>; }
export function CursorControls({ t }: {
    t: Messages;
}) { const { pack, effect, setPack, setEffect } = useCursorTheme(); return <section className="panel settings-panel"><h2>{t.cursor}</h2><p className="muted">{t.settingsCursor}</p><div className="cursor-grid">{CURSOR_PACKS.map(p => <button key={p.id} aria-pressed={pack === p.id} className={`cursor-choice ${pack === p.id ? "active" : ""}`} onClick={() => setPack(p.id)}><img src={`/cursors/${p.id}/default.png`} alt="" width={32} height={32}/><bdi>{p.label}</bdi></button>)}</div><h3>{t.effect}</h3><div className="segmented">{CURSOR_EFFECTS.map(e => <button key={e.id} aria-pressed={effect === e.id} className={effect === e.id ? "active" : ""} onClick={() => setEffect(e.id)}>{e.id === "none" ? "None" : e.id.charAt(0).toUpperCase() + e.id.slice(1)}</button>)}</div></section>; }
