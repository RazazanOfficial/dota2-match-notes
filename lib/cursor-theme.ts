export const CURSOR_PACKS = [
  { id: "acid-hydra", label: "Acid Hydra" },
  { id: "diretide-2020", label: "Diretide 2020" },
  { id: "ti-2017", label: "The International 2017" },
  { id: "ti-2018", label: "The International 2018" },
  { id: "ti-2019", label: "The International 2019" },
  { id: "warcog", label: "Warcog" },
  { id: "wrath-of-ka", label: "Wrath of Ka" },
] as const;

export const CURSOR_EFFECTS = [
  { id: "none", label: "بدون افکت" },
  { id: "gold", label: "طلایی" },
  { id: "fire", label: "آتشی" },
  { id: "ice", label: "یخی" },
] as const;

export type CursorPackId = (typeof CURSOR_PACKS)[number]["id"];
export type CursorEffectId = (typeof CURSOR_EFFECTS)[number]["id"];

export const CURSOR_PACK_STORAGE_KEY = "dota-notes.cursor-pack.v1";
export const CURSOR_EFFECT_STORAGE_KEY = "dota-notes.cursor-effect.v1";
export const DEFAULT_CURSOR_PACK: CursorPackId = "acid-hydra";
export const DEFAULT_CURSOR_EFFECT: CursorEffectId = "none";

export function isCursorPackId(value: unknown): value is CursorPackId {
  return CURSOR_PACKS.some((pack) => pack.id === value);
}

export function isCursorEffectId(value: unknown): value is CursorEffectId {
  return CURSOR_EFFECTS.some((effect) => effect.id === value);
}

