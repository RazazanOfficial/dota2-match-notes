import { useEffect, useState } from "react";
import { defaultPreferences, palettes, preferenceKey, readPreferences, resolveAppearance, type Preferences } from "@dota-notes/design-tokens";

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try { return readPreferences(localStorage.getItem(preferenceKey)); } catch { return { ...defaultPreferences }; }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  const mode = resolveAppearance(preferences.appearance, systemDark);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = preferences.language;
    root.dir = preferences.language === "fa" ? "rtl" : "ltr";
    root.style.colorScheme = mode;
    root.dataset.appearance = mode;
    const colors = palettes[preferences.theme][mode];
    for (const [name, value] of Object.entries(colors)) root.style.setProperty(`--${name}`, value);
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Still usable if storage is unavailable. */ }
  }, [preferences, mode]);
  return { preferences, setPreferences, mode };
}
