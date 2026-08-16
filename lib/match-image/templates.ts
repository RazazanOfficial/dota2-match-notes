import type {
  MatchImageModel,
  MatchImagePlayer,
} from "./model";

export const MATCH_IMAGE_WIDTH = 1280;
export const MATCH_IMAGE_HEIGHT = 720;

type Portraits = ReadonlyMap<number, string | null>;

function xml(value: string | number | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function imageHref(value: string | null | undefined) {
  return value &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : null;
}

function shortName(value: string, maximum = 18) {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function number(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value);
}

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function compact(value: number | null) {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function base(body: string) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${MATCH_IMAGE_WIDTH}" height="${MATCH_IMAGE_HEIGHT}" viewBox="0 0 ${MATCH_IMAGE_WIDTH} ${MATCH_IMAGE_HEIGHT}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#070b11"/>
          <stop offset="0.5" stop-color="#111922"/>
          <stop offset="1" stop-color="#080c12"/>
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1b2632"/>
          <stop offset="1" stop-color="#111820"/>
        </linearGradient>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.025"/>
        </pattern>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.5"/>
        </filter>
        <style>
          text { font-family: Inter, Arial, "DejaVu Sans", sans-serif; fill: #f3f6f8; }
          .muted { fill: #8d9aaa; }
          .tiny { font-size: 13px; letter-spacing: 1.5px; }
          .small { font-size: 16px; }
          .label { font-size: 14px; fill: #8d9aaa; letter-spacing: 1px; }
          .value { font-size: 23px; font-weight: 700; }
          .title { font-size: 28px; font-weight: 800; letter-spacing: 2px; }
          .radiant { fill: #52d273; }
          .dire { fill: #ef5b5b; }
        </style>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <rect width="1280" height="720" fill="url(#grid)"/>
      ${body}
    </svg>`;
}

export function headerTemplate(title: string, subtitle: string) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${MATCH_IMAGE_WIDTH}" height="${MATCH_IMAGE_HEIGHT}" viewBox="0 0 ${MATCH_IMAGE_WIDTH} ${MATCH_IMAGE_HEIGHT}">
      <style>
        text { font-family: Inter, Arial, "DejaVu Sans", sans-serif; fill: #f3f6f8; }
        .muted { fill: #8d9aaa; }
      </style>
      <rect x="24" y="20" width="1232" height="80" rx="16" fill="#0c1219" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="52" y="55" font-size="28" font-weight="800" letter-spacing="2">${xml(title)}</text>
      <text x="52" y="80" font-size="13" letter-spacing="1.5" class="muted">${xml(subtitle)}</text>
      <text x="1228" y="56" text-anchor="end" font-size="16" font-weight="700">DOTA2NOTES.IR</text>
      <text x="1228" y="80" text-anchor="end" font-size="13" letter-spacing="1.5" class="muted">SERVER GENERATED</text>
    </svg>`;
}

function portrait(
  player: MatchImagePlayer,
  portraits: Portraits,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: string,
) {
  const href = imageHref(portraits.get(player.heroId));
  const image = href
    ? `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#202b37"/><text x="${x + width / 2}" y="${y + height / 2 + 8}" text-anchor="middle" font-size="22" font-weight="800" fill="${accent}">${xml(player.heroName.slice(0, 2).toUpperCase())}</text>`;
  return `
    <g>
      <rect x="${x - 2}" y="${y - 2}" width="${width + 4}" height="${height + 4}" rx="10" fill="${accent}" fill-opacity="0.85"/>
      ${image}
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="none" stroke="#071018" stroke-opacity="0.45"/>
    </g>`;
}

function teamPortraits(
  players: MatchImagePlayer[],
  portraits: Portraits,
  startX: number,
  y: number,
  accent: string,
) {
  return players
    .map((player, index) => {
      const x = startX + index * 114;
      return `
        ${portrait(player, portraits, x, y, 98, 116, accent)}
        <text x="${x + 49}" y="${y + 140}" text-anchor="middle" class="small" font-weight="700">${xml(shortName(player.heroName, 13))}</text>
        <text x="${x + 49}" y="${y + 162}" text-anchor="middle" class="tiny muted">${player.kills}/${player.deaths}/${player.assists}</text>`;
    })
    .join("");
}

export function overviewTemplate(model: MatchImageModel, portraits: Portraits) {
  const focus = model.focusPlayer;
  const resultColor = model.focusResult === "win" ? "#52d273" : "#ef5b5b";
  const body = `
    <g filter="url(#shadow)">
      <rect x="24" y="116" width="1232" height="392" rx="18" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.08"/>
    </g>
    <text x="52" y="157" class="label radiant">RADIANT</text>
    <text x="1228" y="157" text-anchor="end" class="label dire">DIRE</text>
    <text x="570" y="174" text-anchor="end" font-size="58" font-weight="900" class="radiant">${model.radiantScore}</text>
    <text x="640" y="166" text-anchor="middle" font-size="24" class="muted">${duration(model.durationSeconds)}</text>
    <text x="710" y="174" font-size="58" font-weight="900" class="dire">${model.direScore}</text>
    <text x="640" y="196" text-anchor="middle" class="tiny muted">${xml(model.lobbyTypeName || "Unknown Lobby")} · ${xml(model.gameModeName || "Unknown Mode")}</text>
    ${teamPortraits(model.radiantPlayers, portraits, 52, 218, "#2cb75a")}
    ${teamPortraits(model.direPlayers, portraits, 680, 218, "#d64848")}
    <rect x="24" y="526" width="1232" height="166" rx="18" fill="#0c1219" stroke="${resultColor}" stroke-opacity="0.45"/>
    ${portrait(focus, portraits, 48, 546, 116, 126, resultColor)}
    <text x="190" y="574" class="label">YOUR MATCH</text>
    <text x="190" y="610" font-size="30" font-weight="800">${xml(shortName(focus.heroName, 16))}</text>
    <text x="190" y="644" font-size="20" font-weight="800" fill="${resultColor}">${model.focusResult.toUpperCase()}</text>
    <text x="480" y="575" class="label">K / D / A</text><text x="480" y="619" font-size="34" font-weight="800">${focus.kills} / ${focus.deaths} / ${focus.assists}</text>
    <text x="720" y="575" class="label">GPM / XPM</text><text x="720" y="619" font-size="34" font-weight="800">${number(focus.goldPerMinute)} / ${number(focus.xpPerMinute)}</text>
    <text x="1010" y="575" class="label">NET WORTH</text><text x="1010" y="619" font-size="34" font-weight="800">${compact(focus.netWorth)}</text>
    <text x="1228" y="662" text-anchor="end" class="tiny muted">MATCH ${xml(model.matchId)}</text>`;
  return base(body);
}

function playerRow(
  player: MatchImagePlayer,
  portraits: Portraits,
  x: number,
  y: number,
  accent: string,
) {
  return `
    <rect x="${x}" y="${y}" width="584" height="94" rx="14" fill="#121b24" stroke="#ffffff" stroke-opacity="0.06"/>
    ${portrait(player, portraits, x + 12, y + 12, 72, 70, accent)}
    <text x="${x + 100}" y="${y + 33}" font-size="17" font-weight="800">${xml(shortName(player.playerName, 13))}</text>
    <text x="${x + 100}" y="${y + 58}" class="tiny muted">${xml(shortName(player.heroName, 12))} · L${number(player.level)}</text>
    <text x="${x + 330}" y="${y + 31}" text-anchor="middle" class="label">K / D / A</text>
    <text x="${x + 330}" y="${y + 64}" text-anchor="middle" class="value">${player.kills} / ${player.deaths} / ${player.assists}</text>
    <text x="${x + 455}" y="${y + 31}" text-anchor="middle" class="label">GPM</text>
    <text x="${x + 455}" y="${y + 64}" text-anchor="middle" class="value">${number(player.goldPerMinute)}</text>
    <text x="${x + 545}" y="${y + 31}" text-anchor="middle" class="label">NW</text>
    <text x="${x + 545}" y="${y + 64}" text-anchor="middle" class="value">${compact(player.netWorth)}</text>`;
}

export function scoreboardTemplate(model: MatchImageModel, portraits: Portraits) {
  const rows = Array.from({ length: 5 }, (_, index) => {
    const y = 156 + index * 104;
    return [
      model.radiantPlayers[index]
        ? playerRow(model.radiantPlayers[index], portraits, 36, y, "#2cb75a")
        : "",
      model.direPlayers[index]
        ? playerRow(model.direPlayers[index], portraits, 660, y, "#d64848")
        : "",
    ].join("");
  }).join("");
  const body = `
    <text x="40" y="138" class="label radiant">RADIANT · ${model.radiantScore}</text>
    <text x="1240" y="138" text-anchor="end" class="label dire">${model.direScore} · DIRE</text>
    ${rows}`;
  return base(body);
}

function metricCard(x: number, y: number, label: string, value: string) {
  return `
    <rect x="${x}" y="${y}" width="216" height="104" rx="14" fill="#121b24" stroke="#ffffff" stroke-opacity="0.07"/>
    <text x="${x + 18}" y="${y + 31}" class="label">${xml(label)}</text>
    <text x="${x + 18}" y="${y + 75}" font-size="31" font-weight="900">${xml(value)}</text>`;
}

function metricBar(
  y: number,
  label: string,
  value: number | null,
  maximum: number,
  color: string,
) {
  const width = value === null ? 0 : Math.max(0, Math.min(764, (value / maximum) * 764));
  return `
    <text x="446" y="${y}" class="label">${xml(label)}</text>
    <text x="1210" y="${y}" text-anchor="end" class="small" font-weight="800">${number(value)}</text>
    <rect x="446" y="${y + 14}" width="764" height="16" rx="8" fill="#1a2530"/>
    <rect x="446" y="${y + 14}" width="${width}" height="16" rx="8" fill="${color}"/>`;
}

export function performanceTemplate(model: MatchImageModel, portraits: Portraits) {
  const focus = model.focusPlayer;
  const accent = model.focusResult === "win" ? "#52d273" : "#ef5b5b";
  const body = `
    <rect x="24" y="116" width="380" height="576" rx="18" fill="url(#panel)" stroke="${accent}" stroke-opacity="0.35"/>
    ${portrait(focus, portraits, 54, 148, 320, 320, accent)}
    <text x="214" y="508" text-anchor="middle" font-size="30" font-weight="900">${xml(focus.heroName)}</text>
    <text x="214" y="538" text-anchor="middle" class="small muted">${xml(shortName(focus.playerName, 28))}</text>
    <rect x="74" y="566" width="280" height="54" rx="27" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-opacity="0.65"/>
    <text x="214" y="602" text-anchor="middle" font-size="22" font-weight="900" fill="${accent}">${model.focusResult.toUpperCase()} · ${focus.kills}/${focus.deaths}/${focus.assists}</text>
    <text x="214" y="655" text-anchor="middle" class="tiny muted">MATCH ${xml(model.matchId)}</text>
    ${metricCard(438, 128, "GPM", number(focus.goldPerMinute))}
    ${metricCard(670, 128, "XPM", number(focus.xpPerMinute))}
    ${metricCard(902, 128, "NET WORTH", compact(focus.netWorth))}
    ${metricBar(290, "HERO DAMAGE", focus.heroDamage, 80_000, "#e97055")}
    ${metricBar(370, "TOWER DAMAGE", focus.towerDamage, 20_000, "#d7ad4b")}
    ${metricBar(450, "LAST HITS", focus.lastHits, 600, "#69a7ff")}
    ${metricBar(530, "DENIES", focus.denies, 50, "#a985e8")}
    <text x="446" y="638" class="small muted">${xml(model.lobbyTypeName || "Unknown Lobby")} · ${xml(model.gameModeName || "Unknown Mode")}</text>
    <text x="1210" y="638" text-anchor="end" class="small muted">${duration(model.durationSeconds)}</text>`;
  return base(body);
}
