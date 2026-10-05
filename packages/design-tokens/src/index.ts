import type { Appearance, Preferences, ThemeName } from "@dota-notes/contracts";
export type { Preferences, ThemeName, Appearance } from "@dota-notes/contracts";
export const themeNames = ["obsidian", "radiant", "nebula"] as const;
export const appearances = ["light", "dark", "system"] as const;
export const defaultPreferences: Preferences = { language: "en", theme: "obsidian", appearance: "system" };
export const preferenceKey = "dota-notes.preferences.v1";
export function readPreferences(serialized: string | null): Preferences {
  try {
    const value: unknown = JSON.parse(serialized ?? "null");
    if (!value || typeof value !== "object") return { ...defaultPreferences };
    const record = value as Record<string, unknown>;
    return {
      language: record.language === "fa" ? "fa" : "en",
      theme: themeNames.includes(record.theme as ThemeName) ? record.theme as ThemeName : defaultPreferences.theme,
      appearance: appearances.includes(record.appearance as Appearance) ? record.appearance as Appearance : defaultPreferences.appearance,
    };
  } catch { return { ...defaultPreferences }; }
}
export function resolveAppearance(appearance: Appearance, systemDark: boolean): "light" | "dark" {
  return appearance === "system" ? (systemDark ? "dark" : "light") : appearance;
}
export interface Palette { bg: string; panel: string; panel2: string; text: string; muted: string; line: string; accent: string; accentText: string; good: string; bad: string }
export const palettes: Record<ThemeName, Record<"light" | "dark", Palette>> = {
  obsidian: {
    dark: { bg: "#111317", panel: "#191c22", panel2: "#22262f", text: "#edf0f6", muted: "#a2aab9", line: "#333a46", accent: "#d9b774", accentText: "#19150d", good: "#78d8ae", bad: "#f098a6" },
    light: { bg: "#f2f3f5", panel: "#ffffff", panel2: "#edf0f4", text: "#202735", muted: "#626d80", line: "#d8dee7", accent: "#855c20", accentText: "#ffffff", good: "#196648", bad: "#a22d48" },
  },
  radiant: {
    dark: { bg: "#101918", panel: "#172321", panel2: "#20312e", text: "#e6f3ee", muted: "#9eb9ae", line: "#304a42", accent: "#70d5b5", accentText: "#0d2119", good: "#78d8ae", bad: "#f098a6" },
    light: { bg: "#f0f5f1", panel: "#ffffff", panel2: "#e7f0ea", text: "#1c3329", muted: "#526c5e", line: "#d1dfd6", accent: "#126b53", accentText: "#ffffff", good: "#196648", bad: "#a22d48" },
  },
  nebula: {
    dark: { bg: "#141321", panel: "#1d1c2d", panel2: "#29273d", text: "#eeecfa", muted: "#aea9c4", line: "#3c3854", accent: "#bba5f2", accentText: "#1d123a", good: "#78d8ae", bad: "#f098a6" },
    light: { bg: "#f4f2fa", panel: "#ffffff", panel2: "#ede9f6", text: "#2b2440", muted: "#6e6283", line: "#ded7ec", accent: "#6844ad", accentText: "#ffffff", good: "#196648", bad: "#a22d48" },
  },
};
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
