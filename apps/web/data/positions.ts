export const POSITION_ASSETS = ["", "pos_1.svg", "pos_2.webp", "pos_3.webp", "pos_4.webp", "pos_5.webp"] as const;
export function positionImage(position: number | null | undefined) { return position && position >= 1 && position <= 5 ? `/positions/${POSITION_ASSETS[position]}` : ""; }
