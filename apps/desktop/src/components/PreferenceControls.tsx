import type { Dispatch, SetStateAction } from "react";
import { Moon, Monitor, MousePointer2, Sun } from "lucide-react";
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
const appearanceIcons = { system: Monitor, light: Sun, dark: Moon };
export function PreferenceControls({ preferences, setPreferences, t }: Props) { return <div className="preference-choices"><div><h3>{t.appearance}</h3><div className="appearance-grid" role="group" aria-label={t.appearance}>{appearances.map(mode => { const Icon = appearanceIcons[mode]; return <button type="button" key={mode} className="appearance-choice" aria-pressed={preferences.appearance === mode} onClick={() => setPreferences(p => ({ ...p, appearance: mode }))}><Icon size={22}/><span>{t[mode]}</span></button>; })}</div></div><div><h3>{t.theme}</h3><div className="theme-grid" role="group" aria-label={t.theme}>{themeNames.map(name => <button type="button" key={name} className={`theme-choice theme-${name}`} aria-pressed={preferences.theme === name} onClick={() => setPreferences(p => ({ ...p, theme: name as Preferences["theme"] }))}><i aria-hidden="true"/>{name.charAt(0).toUpperCase() + name.slice(1)}</button>)}</div></div></div>; }
export function CursorControls({ t, embedded = false }: {
    t: Messages; embedded?: boolean;
}) { const { pack, effect, setPack, setEffect } = useCursorTheme(); return <section className={embedded ? "cursor-settings" : "panel settings-panel cursor-settings"}><h2>{t.cursor}</h2><p className="muted">{t.settingsCursor}</p><div className="cursor-grid">{CURSOR_PACKS.map(p => <button type="button" key={p.id} aria-pressed={pack === p.id} className={`cursor-choice ${pack === p.id ? "active" : ""}`} onClick={() => setPack(p.id)}>{p.id === "system" ? <MousePointer2 size={25} aria-hidden="true"/> : <img src={`/cursors/${p.id}/default.png`} alt="" width={32} height={32}/>}<bdi>{p.id === "system" ? t.systemCursor : p.label}</bdi></button>)}</div><h3>{t.effect}</h3><div className="segmented cursor-effects">{CURSOR_EFFECTS.map(e => <button type="button" key={e.id} aria-pressed={effect === e.id} className={effect === e.id ? "active" : ""} onClick={() => setEffect(e.id)}>{e.id === "none" ? t.noEffect : e.id.charAt(0).toUpperCase() + e.id.slice(1)}</button>)}</div></section>; }
