import { randomUUID } from "node:crypto";
import path from "node:path";
import { getStorageConfig } from "./config";

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

const MIME_EXTENSIONS: Record<ImageMimeType, ReadonlySet<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
};

export function createMatchImageKey(
  matchId: string,
  originalName: string,
  mimeType: ImageMimeType,
) {
  const extension = path.extname(originalName).toLowerCase();
  if (!MIME_EXTENSIONS[mimeType].has(extension)) {
    throw new Error("پسوند فایل با نوع تصویر هماهنگ نیست");
  }
  return `matches/${matchId}/${randomUUID()}${extension}`;
}

export function makePublicImageUrl(objectKey: string) {
  const safeKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${getStorageConfig().publicBaseUrl}/${safeKey}`;
}

export function isMatchImageKey(objectKey: string, matchId: string) {
  const escapedMatchId = matchId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^matches/${escapedMatchId}/[0-9a-f-]{36}\\.(?:jpg|jpeg|png|webp)$`,
    "i",
  ).test(objectKey);
}
