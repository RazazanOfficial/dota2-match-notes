import { randomUUID } from "node:crypto";
import { getStorageConfig } from "./config";

export const GENERATED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type GeneratedImageMimeType =
  (typeof GENERATED_IMAGE_MIME_TYPES)[number];

const MIME_EXTENSION: Record<GeneratedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function createGeneratedMatchImageKey(
  matchId: string,
  sortOrder: number,
  mimeType: GeneratedImageMimeType,
) {
  if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 3) {
    throw new Error("جایگاه تصویر تولیدشده نامعتبر است");
  }
  const extension = MIME_EXTENSION[mimeType];
  return `matches/${matchId}/generated-${sortOrder}-${randomUUID()}.${extension}`;
}

export function makePublicImageUrl(objectKey: string) {
  const safeKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${getStorageConfig().publicBaseUrl}/${safeKey}`;
}

export function isMatchImageKey(objectKey: string, matchId: string) {
  const escapedMatchId = matchId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^matches/${escapedMatchId}/generated-[1-3]-[0-9a-f-]{36}\\.(?:jpg|png|webp)$`,
    "i",
  ).test(objectKey);
}
