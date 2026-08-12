import path from "node:path";
import { z } from "zod";
import {
  GENERATED_IMAGE_MIME_TYPES,
  type GeneratedImageMimeType,
} from "../storage/media";
import { MediaError } from "./errors";

const MAX_GENERATED_IMAGES = 3;
const MAX_IMAGE_DIMENSION = 20_000;

const MIME_EXTENSIONS: Record<GeneratedImageMimeType, ReadonlySet<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
};

export interface GeneratedMatchImageArtifact {
  fileName: string;
  mimeType: GeneratedImageMimeType;
  bytes: Uint8Array;
  width: number;
  height: number;
  altText: string;
}

function assertGeneratedImage(
  artifact: GeneratedMatchImageArtifact,
  maxImageBytes: number,
) {
  const fileName = artifact.fileName.trim();
  if (
    !fileName ||
    fileName.length > 255 ||
    path.basename(fileName) !== fileName ||
    /[\u0000-\u001f\u007f]/.test(fileName)
  ) {
    throw new MediaError(
      422,
      "invalid_generated_image",
      "نام فایل تصویر تولیدشده نامعتبر است",
    );
  }

  if (!GENERATED_IMAGE_MIME_TYPES.includes(artifact.mimeType)) {
    throw new MediaError(
      422,
      "invalid_generated_image",
      "نوع تصویر تولیدشده پشتیبانی نمی‌شود",
    );
  }
  const extension = path.extname(fileName).toLowerCase();
  if (!MIME_EXTENSIONS[artifact.mimeType].has(extension)) {
    throw new MediaError(
      422,
      "invalid_generated_image",
      "پسوند تصویر تولیدشده با نوع آن هماهنگ نیست",
    );
  }

  if (
    !(artifact.bytes instanceof Uint8Array) ||
    artifact.bytes.byteLength <= 0 ||
    artifact.bytes.byteLength > maxImageBytes
  ) {
    throw new MediaError(
      422,
      "invalid_generated_image",
      "حجم تصویر تولیدشده نامعتبر است",
    );
  }

  if (
    !Number.isInteger(artifact.width) ||
    !Number.isInteger(artifact.height) ||
    artifact.width <= 0 ||
    artifact.height <= 0 ||
    artifact.width > MAX_IMAGE_DIMENSION ||
    artifact.height > MAX_IMAGE_DIMENSION
  ) {
    throw new MediaError(
      422,
      "invalid_generated_image",
      "ابعاد تصویر تولیدشده نامعتبر است",
    );
  }

  if (artifact.altText.trim().length > 500) {
    throw new MediaError(
      422,
      "invalid_generated_image",
      "متن جایگزین تصویر بیش از حد طولانی است",
    );
  }

  return {
    ...artifact,
    fileName,
    altText: artifact.altText.trim(),
  };
}

export function validateGeneratedMatchImages(
  artifacts: GeneratedMatchImageArtifact[],
  maxImageBytes: number,
) {
  if (!Array.isArray(artifacts) || artifacts.length < 1) {
    throw new MediaError(
      422,
      "generated_images_required",
      "حداقل یک تصویر تولیدشده لازم است",
    );
  }
  if (artifacts.length > MAX_GENERATED_IMAGES) {
    throw new MediaError(
      422,
      "generated_image_limit",
      "برای هر مچ حداکثر ۳ تصویر تولید می‌شود",
    );
  }

  return artifacts.map((artifact) =>
    assertGeneratedImage(artifact, maxImageBytes),
  );
}

export function parseUuid(value: string) {
  return z.string().uuid().safeParse(value);
}
