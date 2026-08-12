import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaError } from "../lib/media/errors";
import { validateGeneratedMatchImages } from "../lib/media/validation";
import { getStorageConfig } from "../lib/storage/config";
import {
  createGeneratedMatchImageKey,
  isMatchImageKey,
  makePublicImageUrl,
} from "../lib/storage/media";

const STORAGE_ENV = [
  "CLOUD_SPACE_END_POINT_URL",
  "CLOUD_SPACE_BUCKET",
  "CLOUD_SPACE_PUBLIC_BASE_URL",
  "CLOUD_SPACE_ACCESS_KEY",
  "CLOUD_SPACE_SECRET_KEY",
  "CLOUD_SPACE_REGION",
  "CLOUD_SPACE_FORCE_PATH_STYLE",
  "GENERATED_IMAGE_MAX_BYTES",
] as const;
const originalEnv = Object.fromEntries(
  STORAGE_ENV.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  process.env.CLOUD_SPACE_END_POINT_URL = "s3.example.test";
  process.env.CLOUD_SPACE_BUCKET = "match-images";
  process.env.CLOUD_SPACE_PUBLIC_BASE_URL = "https://cdn.example.test/bucket/";
  process.env.CLOUD_SPACE_ACCESS_KEY = "test-access";
  process.env.CLOUD_SPACE_SECRET_KEY = "test-secret";
  process.env.CLOUD_SPACE_REGION = "test-region";
  process.env.CLOUD_SPACE_FORCE_PATH_STYLE = "true";
  process.env.GENERATED_IMAGE_MAX_BYTES = "12582912";
});

afterEach(() => {
  STORAGE_ENV.forEach((name) => {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

describe("ParsPack storage configuration", () => {
  it("normalizes the endpoint and public bucket root", () => {
    expect(getStorageConfig()).toMatchObject({
      endpoint: "https://s3.example.test",
      bucket: "match-images",
      publicBaseUrl: "https://cdn.example.test/bucket",
      region: "test-region",
      forcePathStyle: true,
      maxGeneratedImageBytes: 12_582_912,
    });
  });

  it("rejects a bucket value that is a URL", () => {
    process.env.CLOUD_SPACE_BUCKET = "https://wrong.example.test/bucket";
    expect(() => getStorageConfig()).toThrow("Invalid env: CLOUD_SPACE_BUCKET");
  });
});

describe("generated match image object keys", () => {
  const matchId = "11111111-1111-4111-8111-111111111111";

  it("creates a versioned key inside the match folder", () => {
    const key = createGeneratedMatchImageKey(matchId, 2, "image/webp");
    expect(key).toMatch(
      /^matches\/11111111-1111-4111-8111-111111111111\/generated-2-[0-9a-f-]{36}\.webp$/,
    );
    expect(isMatchImageKey(key, matchId)).toBe(true);
    expect(makePublicImageUrl(key)).toBe(`https://cdn.example.test/bucket/${key}`);
  });

  it("rejects image slots outside one to three", () => {
    expect(() =>
      createGeneratedMatchImageKey(matchId, 4, "image/png"),
    ).toThrow("جایگاه تصویر");
  });
});

describe("server-generated match image validation", () => {
  const validImage = {
    fileName: "match-summary.png",
    mimeType: "image/png" as const,
    bytes: new Uint8Array([137, 80, 78, 71]),
    width: 1280,
    height: 720,
    altText: "Match summary",
  };

  it("accepts one to three generated images", () => {
    const result = validateGeneratedMatchImages(
      [validImage, { ...validImage, fileName: "scoreboard.png" }],
      4096,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ width: 1280, height: 720 });
  });

  it("rejects more than three generated images", () => {
    expect(() =>
      validateGeneratedMatchImages(
        [validImage, validImage, validImage, validImage],
        4096,
      ),
    ).toThrowError(MediaError);
  });

  it("rejects invalid size, dimensions or MIME extension", () => {
    expect(() =>
      validateGeneratedMatchImages(
        [{ ...validImage, bytes: new Uint8Array(0) }],
        4096,
      ),
    ).toThrow("حجم تصویر");
    expect(() =>
      validateGeneratedMatchImages(
        [{ ...validImage, width: 0 }],
        4096,
      ),
    ).toThrow("ابعاد تصویر");
    expect(() =>
      validateGeneratedMatchImages(
        [{ ...validImage, fileName: "fake.jpg" }],
        4096,
      ),
    ).toThrow("پسوند تصویر");
  });
});
