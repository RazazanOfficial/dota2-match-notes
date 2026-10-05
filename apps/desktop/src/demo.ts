// Fictional values for the desktop foundation. Never merge these into journal data.
export const demoMatch = { id: "9026000101", duration: "36:42", score: "34 — 21", lane: 81 };
export interface DemoPlayer { name: string; hero: string; asset: string; role: number; kills: number; deaths: number; assists: number; worth: number; gpm: number; xpm: number; lh: number; denies: number; side: "radiant" | "dire" }
export const demoPlayers: DemoPlayer[] = [
  { name: "MeriJ", hero: "Ember Spirit", asset: "ember_spirit", role: 2, kills: 9, deaths: 3, assists: 17, worth: 21480, gpm: 587, xpm: 724, lh: 286, denies: 18, side: "radiant" },
  { name: "Carry One", hero: "Juggernaut", asset: "juggernaut", role: 1, kills: 11, deaths: 4, assists: 9, worth: 24800, gpm: 675, xpm: 790, lh: 328, denies: 12, side: "radiant" },
  { name: "Frontline", hero: "Axe", asset: "axe", role: 3, kills: 6, deaths: 5, assists: 18, worth: 17200, gpm: 469, xpm: 610, lh: 210, denies: 8, side: "radiant" },
  { name: "Forest", hero: "Hoodwink", asset: "hoodwink", role: 4, kills: 5, deaths: 4, assists: 21, worth: 9800, gpm: 267, xpm: 480, lh: 94, denies: 5, side: "radiant" },
  { name: "Frost", hero: "Crystal Maiden", asset: "crystal_maiden", role: 5, kills: 3, deaths: 5, assists: 24, worth: 7300, gpm: 199, xpm: 395, lh: 38, denies: 3, side: "radiant" },
  { name: "Blink", hero: "Anti-Mage", asset: "antimage", role: 1, kills: 7, deaths: 6, assists: 5, worth: 22100, gpm: 603, xpm: 685, lh: 315, denies: 14, side: "dire" },
  { name: "Invoker Two", hero: "Invoker", asset: "invoker", role: 2, kills: 5, deaths: 7, assists: 10, worth: 18500, gpm: 504, xpm: 620, lh: 242, denies: 11, side: "dire" },
  { name: "Anchor", hero: "Tidehunter", asset: "tidehunter", role: 3, kills: 4, deaths: 6, assists: 12, worth: 14000, gpm: 381, xpm: 525, lh: 190, denies: 6, side: "dire" },
  { name: "Spell Thief", hero: "Rubick", asset: "rubick", role: 4, kills: 3, deaths: 8, assists: 13, worth: 8400, gpm: 229, xpm: 410, lh: 80, denies: 4, side: "dire" },
  { name: "Willow", hero: "Dark Willow", asset: "dark_willow", role: 5, kills: 2, deaths: 7, assists: 14, worth: 6100, gpm: 166, xpm: 365, lh: 42, denies: 2, side: "dire" },
];
const finalAdvantage = demoPlayers.reduce((sum, player) => sum + (player.side === "radiant" ? player.worth : -player.worth), 0);
export const goldAdvantage = [0, 600, -250, 1100, 1700, 1350, 3100, 4500, 3900, 5900, 7800, 9100, finalAdvantage];
