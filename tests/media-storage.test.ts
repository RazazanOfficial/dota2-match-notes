import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStorageConfig } from "../lib/storage/config";
import {
  createMatchImageKey,
  isMatchImageKey,
  makePublicImageUrl,
} from "../lib/storage/media";
import {
  confirmImageSchema,
  parsePresignInput,
} from "../lib/media/validation";

const STORAGE_ENV = [
  "CLOUD_SPACE_END_POINT_URL",
  "CLOUD_SPACE_BUCKET",
  "CLOUD_SPACE_PUBLIC_BASE_URL",
  "CLOUD_SPACE_ACCESS_KEY",
  "CLOUD_SPACE_SECRET_KEY",
  "CLOUD_SPACE_REGION",
  "CLOUD_SPACE_FORCE_PATH_STYLE",
  "MEDIA_PRESIGN_TTL_SECONDS",
  "MATCH_IMAGE_MAX_BYTES",
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
  process.env.MEDIA_PRESIGN_TTL_SECONDS = "300";
  process.env.MATCH_IMAGE_MAX_BYTES = "8388608";
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
      presignTtlSeconds: 300,
      maxImageBytes: 8_388_608,
    });
  });

  it("rejects a bucket value that is a URL", () => {
    process.env.CLOUD_SPACE_BUCKET = "https://wrong.example.test/bucket";
    expect(() => getStorageConfig()).toThrow("Invalid env: CLOUD_SPACE_BUCKET");
  });
});

describe("match image object keys", () => {
  const matchId = "11111111-1111-4111-8111-111111111111";

  it("creates a UUID key inside the match folder", () => {
    const key = createMatchImageKey(matchId, "score.WEBP", "image/webp");
    expect(key).toMatch(
      /^matches\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]{36}\.webp$/,
    );
    expect(isMatchImageKey(key, matchId)).toBe(true);
    expect(makePublicImageUrl(key)).toBe(`https://cdn.example.test/bucket/${key}`);
  });

  it("rejects an extension that disagrees with the MIME type", () => {
    expect(() => createMatchImageKey(matchId, "fake.png", "image/jpeg")).toThrow(
      "پسوند فایل",
    );
  });
});

describe("match image validation", () => {
  it("allows JPEG, PNG and WebP inside the configured size limit", () => {
    expect(
      parsePresignInput(
        { fileName: "match.jpg", contentType: "image/jpeg", size: 2048 },
        4096,
      ),
    ).toMatchObject({ contentType: "image/jpeg", size: 2048 });
  });

  it("rejects oversized or unsupported uploads before presigning", () => {
    expect(() =>
      parsePresignInput(
        { fileName: "match.gif", contentType: "image/gif", size: 2048 },
        4096,
      ),
    ).toThrow();
    expect(() =>
      parsePresignInput(
        { fileName: "match.png", contentType: "image/png", size: 4097 },
        4096,
      ),
    ).toThrow();
  });

  it("accepts optional dimensions and alt text during confirmation", () => {
    expect(
      confirmImageSchema.parse({
        uploadId: "22222222-2222-4222-8222-222222222222",
        objectKey: "matches/example/image.webp",
        width: 1280,
        height: 720,
        altText: "Match summary",
      }),
    ).toMatchObject({ width: 1280, height: 720, altText: "Match summary" });
  });
});
