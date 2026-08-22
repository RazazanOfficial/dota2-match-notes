import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createHeroPortraitLoader } from "../lib/match-image/assets";
import { getMatchImageConfig } from "../lib/match-image/config";
import { MatchImageError } from "../lib/match-image/errors";
import { buildMatchImageModel } from "../lib/match-image/model";
import { renderGeneratedMatchImages } from "../lib/match-image/renderer";
import { validateGeneratedMatchImages } from "../lib/media/validation";
import { parseOpenDotaMatch } from "../lib/opendota/validation";

const FOCUS_ACCOUNT_ID = 988_195_076;
const PLAYER_HERO_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ORIGINAL_IMAGE_ENV = {
  timeout: process.env.MATCH_IMAGE_ASSET_TIMEOUT_MS,
  maxBytes: process.env.MATCH_IMAGE_ASSET_MAX_BYTES,
  quality: process.env.MATCH_IMAGE_WEBP_QUALITY,
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function matchPayload() {
  return {
    match_id: 8_945_334_073,
    start_time: 1_786_718_956,
    duration: 2_634,
    radiant_win: true,
    radiant_score: 42,
    dire_score: 31,
    game_mode: 22,
    lobby_type: 7,
    players: PLAYER_HERO_IDS.map((heroId, index) => ({
      account_id: index === 0 ? FOCUS_ACCOUNT_ID : 100_000 + index,
      personaname: index === 0 ? "Meri-J" : `Player ${index + 1}`,
      player_slot: index < 5 ? index : 128 + index - 5,
      hero_id: heroId,
      level: 25,
      kills: 12 - index,
      deaths: index,
      assists: 10 + index,
      last_hits: 320 - index * 12,
      denies: index + 1,
      gold_per_min: 700 - index * 20,
      xp_per_min: 820 - index * 20,
      net_worth: 31_000 - index * 1_000,
      hero_damage: 52_000 - index * 2_000,
      tower_damage: 6_000 - index * 300,
    })),
  };
}

afterEach(() => {
  restoreEnv("MATCH_IMAGE_ASSET_TIMEOUT_MS", ORIGINAL_IMAGE_ENV.timeout);
  restoreEnv("MATCH_IMAGE_ASSET_MAX_BYTES", ORIGINAL_IMAGE_ENV.maxBytes);
  restoreEnv("MATCH_IMAGE_WEBP_QUALITY", ORIGINAL_IMAGE_ENV.quality);
});

describe("match image model", () => {
  it("builds two teams and the focused player result", () => {
    const payload = matchPayload();
    const match = parseOpenDotaMatch(payload, payload.match_id);
    const model = buildMatchImageModel(match, FOCUS_ACCOUNT_ID);

    expect(model).toMatchObject({
      matchId: "8945334073",
      radiantScore: 42,
      direScore: 31,
      gameModeName: "All Draft",
      lobbyTypeName: "Ranked",
      focusResult: "win",
    });
    expect(model.radiantPlayers).toHaveLength(5);
    expect(model.direPlayers).toHaveLength(5);
    expect(model.focusPlayer.playerName).toBe("Meri-J");
  });

  it("rejects rendering for an account absent from the match", () => {
    const payload = matchPayload();
    const match = parseOpenDotaMatch(payload, payload.match_id);
    expect(() => buildMatchImageModel(match, 999_999_999)).toThrow(
      MatchImageError,
    );
  });
});

describe("in-memory match image renderer", () => {
  it("produces three valid 1280x720 WebP artifacts without asset files", async () => {
    const payload = matchPayload();
    const match = parseOpenDotaMatch(payload, payload.match_id);
    const model = buildMatchImageModel(match, FOCUS_ACCOUNT_ID);
    const artifacts = await renderGeneratedMatchImages(model, {
      config: {
        assetTimeoutMs: 1_000,
        assetMaxBytes: 1_572_864,
        webpQuality: 82,
      },
      portraitLoader: async () => null,
    });

    expect(artifacts).toHaveLength(3);
    expect(() =>
      validateGeneratedMatchImages(artifacts, 12 * 1024 * 1024),
    ).not.toThrow();

    for (const artifact of artifacts) {
      expect(artifact).toMatchObject({
        mimeType: "image/webp",
        width: 1280,
        height: 720,
      });
      expect(Buffer.from(artifact.bytes).subarray(0, 4).toString()).toBe(
        "RIFF",
      );
      expect(Buffer.from(artifact.bytes).subarray(8, 12).toString()).toBe(
        "WEBP",
      );
      await expect(sharp(artifact.bytes).metadata()).resolves.toMatchObject({
        format: "webp",
        width: 1280,
        height: 720,
      });
    }
  });
});

describe("hero portrait loader", () => {
  it("reads known portraits from local project assets and caches bytes", async () => {
    const loader = createHeroPortraitLoader({
      assetTimeoutMs: 1_000,
      assetMaxBytes: 1_572_864,
      webpQuality: 88,
    });

    await expect(loader(1)).resolves.toMatch(/^data:image\/png;base64,/);
    await expect(loader(1)).resolves.toMatch(/^data:image\/png;base64,/);
    await expect(loader(999_999)).resolves.toBeNull();
  });

  it("rejects a local portrait larger than the configured limit", async () => {
    const loader = createHeroPortraitLoader({
      assetTimeoutMs: 1_000,
      assetMaxBytes: 1_024,
      webpQuality: 88,
    });

    await expect(loader(1)).resolves.toBeNull();
  });

  it("uses bounded resource defaults", () => {
    delete process.env.MATCH_IMAGE_ASSET_TIMEOUT_MS;
    delete process.env.MATCH_IMAGE_ASSET_MAX_BYTES;
    delete process.env.MATCH_IMAGE_WEBP_QUALITY;
    expect(getMatchImageConfig()).toEqual({
      assetTimeoutMs: 5_000,
      assetMaxBytes: 1_572_864,
      webpQuality: 88,
    });
  });
});
