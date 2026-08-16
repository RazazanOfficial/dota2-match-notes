import sharp from "sharp";
import type { GeneratedMatchImageArtifact } from "../media/validation";
import {
  createHeroPortraitLoader,
  type HeroPortraitLoader,
} from "./assets";
import {
  getMatchImageConfig,
  type MatchImageConfig,
} from "./config";
import type { MatchImageModel } from "./model";
import {
  MATCH_IMAGE_HEIGHT,
  MATCH_IMAGE_WIDTH,
  headerTemplate,
  overviewTemplate,
  performanceTemplate,
  scoreboardTemplate,
} from "./templates";

interface RenderMatchImagesOptions {
  config?: MatchImageConfig;
  portraitLoader?: HeroPortraitLoader;
}

async function loadPortraits(
  model: MatchImageModel,
  loader: HeroPortraitLoader,
) {
  const heroIds = [
    ...model.radiantPlayers,
    ...model.direPlayers,
    model.focusPlayer,
  ].map((player) => player.heroId);
  const uniqueHeroIds = [...new Set(heroIds)];
  const entries = await Promise.all(
    uniqueHeroIds.map(async (heroId) => [heroId, await loader(heroId)] as const),
  );
  return new Map(entries);
}

async function renderWebp(
  svg: string,
  quality: number,
  fileName: string,
  altText: string,
  headerSvg: string,
): Promise<GeneratedMatchImageArtifact> {
  const bytes = await sharp(Buffer.from(svg), {
    density: 72,
    limitInputPixels: MATCH_IMAGE_WIDTH * MATCH_IMAGE_HEIGHT * 2,
  })
    .composite([{ input: Buffer.from(headerSvg), top: 0, left: 0 }])
    .webp({ quality, effort: 4, smartSubsample: true })
    .toBuffer();

  return {
    fileName,
    mimeType: "image/webp",
    bytes,
    width: MATCH_IMAGE_WIDTH,
    height: MATCH_IMAGE_HEIGHT,
    altText,
  };
}

/**
 * Produces exactly three WebP images in memory. No temporary or permanent file
 * is created; the returned byte arrays are ready for publishGeneratedMatchImages.
 */
export async function renderGeneratedMatchImages(
  model: MatchImageModel,
  options: RenderMatchImagesOptions = {},
) {
  const config = options.config || getMatchImageConfig();
  const portraitLoader =
    options.portraitLoader || createHeroPortraitLoader(config);
  const portraits = await loadPortraits(model, portraitLoader);
  const prefix = `dota-match-${model.matchId}`;

  const templates = [
    {
      svg: overviewTemplate(model, portraits),
      headerSvg: headerTemplate(
        "MATCH OVERVIEW",
        `${model.startedAt.slice(0, 10)} · MATCH ${model.matchId}`,
      ),
      fileName: `${prefix}-overview.webp`,
      altText: `نمای کلی مچ Dota 2 شماره ${model.matchId}`,
    },
    {
      svg: scoreboardTemplate(model, portraits),
      headerSvg: headerTemplate(
        "TEAM SCOREBOARD",
        `${model.lobbyTypeName || "Unknown Lobby"} · ${model.gameModeName || "Unknown Mode"} · ${Math.floor(model.durationSeconds / 60)}:${String(model.durationSeconds % 60).padStart(2, "0")}`,
      ),
      fileName: `${prefix}-scoreboard.webp`,
      altText: `جدول امتیازات بازیکنان مچ Dota 2 شماره ${model.matchId}`,
    },
    {
      svg: performanceTemplate(model, portraits),
      headerSvg: headerTemplate(
        "PLAYER PERFORMANCE",
        `${model.startedAt.slice(0, 10)} · PERSONAL MATCH CARD`,
      ),
      fileName: `${prefix}-performance.webp`,
      altText: `عملکرد بازیکن در مچ Dota 2 شماره ${model.matchId}`,
    },
  ];

  const artifacts: GeneratedMatchImageArtifact[] = [];
  for (const template of templates) {
    artifacts.push(
      await renderWebp(
        template.svg,
        config.webpQuality,
        template.fileName,
        template.altText,
        template.headerSvg,
      ),
    );
  }
  return artifacts;
}
