export type DotaMapLayer = "towers" | "camps" | "lotus" | "gates" | "tormentors" | "bounty" | "power" | "wisdom" | "watchers" | "roshan";

export interface DotaMapLandmark {
  id: string;
  layer: DotaMapLayer;
  x: number;
  y: number;
  label: string;
  side?: "radiant" | "dire" | "neutral";
  size?: "small" | "medium" | "large" | "ancient";
}

const CAMP_SIZE = ["small", "medium", "large", "ancient"] as const;

const TOWERS = [[30.31,77.76],[26.87,68.32],[17.11,64.79],[48.28,78.45],[74.38,79.04],[34.12,62.48],[17.57,52.63],[18.39,39.55],[21.51,71.78],[74.8,25.54],[49.44,19.6],[23.7,19.5],[62.56,38.32],[52.7,45.32],[82.08,46.61],[81.76,33.91],[67.84,20.75],[71.44,30.42],[76.48,27.19],[23.11,73.35],[42.36,55.2],[81.42,59.19]] as const;
const CAMPS = [[45.82,24.76,1],[67.04,55.2,1],[69.97,72.56,0],[89.72,49.03,2],[25.95,29.67,2],[73.32,66.19,2],[42.81,64.55,2],[51.01,73.38,1],[25,48.91,3],[71.84,48.22,3],[40.16,71.54,1],[56.2,28.42,1],[30.01,43.69,1],[46.48,85.36,1],[51.76,11.54,1],[55.4,36.08,2],[92.23,42.39,0],[8.51,51.1,2],[35.67,13.07,0],[37.09,29.98,1],[63.92,88.43,0],[59.69,67.51,1],[30.52,25.29,0],[9.96,57.26,0],[60.16,10.58,1],[38,88.75,1],[72.16,88.89,1],[29.03,8.47,1]] as const;

function points(layer: Exclude<DotaMapLayer, "camps">, coordinates: ReadonlyArray<readonly [number, number]>, label: string): DotaMapLandmark[] {
  return coordinates.map(([x, y], index) => ({ id: `${layer}-${index + 1}`, layer, x, y, label: `${label} ${index + 1}`, side: "neutral" }));
}

export const DOTA_741_LANDMARKS: DotaMapLandmark[] = [
  ...points("towers", TOWERS, "Tower"),
  ...CAMPS.map(([x, y, tier], index): DotaMapLandmark => ({ id: `camp-${index + 1}`, layer: "camps", x, y, label: `${CAMP_SIZE[tier]} Camp`, size: CAMP_SIZE[tier], side: "neutral" })),
  ...points("lotus", [[12.33,28.26],[87.6,69.58]], "Lotus Pool"),
  ...points("gates", [[17.78,12],[82.21,83.53]], "Twin Gate"),
  ...points("tormentors", [[11.67,18.06],[88.8,78.22]], "Tormentor"),
  ...points("bounty", [[45.1,27.2],[53.05,70.8]], "Bounty Rune"),
  ...points("power", [[41.88,43.12],[55.98,54.28]], "Power Rune"),
  ...points("wisdom", [[9.63,44.77],[90.91,53.93]], "Wisdom Shrine"),
  ...points("watchers", [[89.67,55.76],[17.75,16.53],[63.67,51.6],[32.66,48.29],[55.24,68.88],[82.72,80.07],[53.92,85.13],[46.72,14.25],[42.44,29.62],[11.03,43.39]], "Watcher"),
  ...points("roshan", [[64.23,61.59],[34.1,36.96]], "Roshan Pit"),
];

export const DOTA_MAP_LAYER_LABELS: Record<DotaMapLayer, { en: string; fa: string }> = {
  towers: { en: "Towers", fa: "برج‌ها" },
  camps: { en: "Camps", fa: "کمپ‌ها" },
  lotus: { en: "Lotus", fa: "حوضچه Lotus" },
  gates: { en: "Twin Gates", fa: "دروازه‌ها" },
  tormentors: { en: "Tormentors", fa: "تورمنتور" },
  bounty: { en: "Bounty", fa: "رون Bounty" },
  power: { en: "Power Runes", fa: "رون Power" },
  wisdom: { en: "Wisdom", fa: "رون Wisdom" },
  watchers: { en: "Watchers", fa: "واچرها" },
  roshan: { en: "Roshan", fa: "روشان" },
};
