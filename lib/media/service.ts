import type { SessionUser } from "@/lib/auth/session";
import {
  createPresignedUpload,
  deleteStoredObject,
  headStoredObject,
  isStorageNotFound,
} from "@/lib/storage/client";
import { getStorageConfig } from "@/lib/storage/config";
import {
  createMatchImageKey,
  isMatchImageKey,
  makePublicImageUrl,
} from "@/lib/storage/media";
import { MediaError } from "./errors";
import {
  confirmMatchImage,
  deleteMatchImageRecord,
  discardPendingMatchImage,
  findConfirmedMatchImageByKey,
  findOwnedMatchImage,
  findPendingMatchImage,
  listMatchImages,
  reserveMatchImageUpload,
} from "./repository";
import { confirmImageSchema, parsePresignInput } from "./validation";

function serializeImage(image: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  sortOrder: number;
  objectKey: string;
  createdAt: Date;
}) {
  return {
    id: image.id,
    publicUrl: makePublicImageUrl(image.objectKey),
    originalName: image.originalName,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    width: image.width,
    height: image.height,
    altText: image.altText,
    sortOrder: image.sortOrder,
    createdAt: image.createdAt.toISOString(),
  };
}

async function bestEffortDelete(objectKey: string) {
  try {
    await deleteStoredObject(objectKey);
  } catch (error) {
    if (!isStorageNotFound(error)) {
      console.warn("Unable to clean up match image object", { objectKey });
    }
  }
}

export async function prepareMatchImageUpload(
  user: SessionUser,
  matchId: string,
  rawInput: unknown,
) {
  const config = getStorageConfig();
  const input = parsePresignInput(rawInput, config.maxImageBytes);
  let objectKey: string;
  try {
    objectKey = createMatchImageKey(matchId, input.fileName, input.contentType);
  } catch (error) {
    throw new MediaError(
      422,
      "invalid_file_extension",
      error instanceof Error ? error.message : "پسوند فایل نامعتبر است",
    );
  }

  const signed = await createPresignedUpload(objectKey, input.contentType);
  const expiresAt = new Date(Date.now() + signed.expiresIn * 1_000);
  const { reservation, expiredObjectKeys } = await reserveMatchImageUpload({
    userId: user.id,
    matchId,
    objectKey,
    originalName: input.fileName,
    mimeType: input.contentType,
    sizeBytes: input.size,
    expiresAt,
  });

  await Promise.allSettled(expiredObjectKeys.map(bestEffortDelete));

  return {
    uploadId: reservation.id,
    uploadUrl: signed.uploadUrl,
    objectKey,
    publicUrl: makePublicImageUrl(objectKey),
    expiresIn: signed.expiresIn,
    headers: signed.headers,
  };
}

export async function completeMatchImageUpload(
  user: SessionUser,
  matchId: string,
  rawInput: unknown,
) {
  const input = confirmImageSchema.parse(rawInput);
  if (!isMatchImageKey(input.objectKey, matchId)) {
    throw new MediaError(422, "invalid_object_key", "کلید تصویر نامعتبر است");
  }

  const existing = await findConfirmedMatchImageByKey(
    user.id,
    matchId,
    input.objectKey,
  );
  if (existing) return serializeImage(existing);

  const pending = await findPendingMatchImage(
    user.id,
    matchId,
    input.uploadId,
    input.objectKey,
  );
  if (!pending) {
    throw new MediaError(404, "upload_not_found", "درخواست آپلود پیدا نشد");
  }
  if (pending.expiresAt.getTime() <= Date.now()) {
    await discardPendingMatchImage(user.id, matchId, input.uploadId);
    await bestEffortDelete(input.objectKey);
    throw new MediaError(410, "upload_expired", "مهلت تأیید آپلود تمام شده است");
  }

  let head;
  try {
    head = await headStoredObject(input.objectKey);
  } catch (error) {
    if (isStorageNotFound(error)) {
      throw new MediaError(
        422,
        "object_not_uploaded",
        "فایل هنوز در فضای ابری آپلود نشده است",
      );
    }
    throw new MediaError(502, "storage_unavailable", "فضای ذخیره‌سازی پاسخ نداد");
  }

  const config = getStorageConfig();
  const verifiedSize = Number(head.ContentLength || 0);
  const verifiedType = String(head.ContentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    verifiedSize <= 0 ||
    verifiedSize > config.maxImageBytes ||
    verifiedSize !== pending.sizeBytes ||
    verifiedType !== pending.mimeType
  ) {
    await discardPendingMatchImage(user.id, matchId, input.uploadId);
    await bestEffortDelete(input.objectKey);
    throw new MediaError(
      422,
      "uploaded_object_mismatch",
      "فایل آپلودشده با مشخصات تأییدشده هماهنگ نیست",
    );
  }

  try {
    const image = await confirmMatchImage(
      user.id,
      matchId,
      input.uploadId,
      input.objectKey,
      {
        width: input.width ?? null,
        height: input.height ?? null,
        altText: input.altText,
        verifiedSizeBytes: verifiedSize,
      },
    );
    return serializeImage(image);
  } catch (error) {
    if (
      error instanceof MediaError &&
      ["image_limit_reached", "upload_expired"].includes(error.code)
    ) {
      await discardPendingMatchImage(user.id, matchId, input.uploadId);
      await bestEffortDelete(input.objectKey);
    }
    throw error;
  }
}

export async function getPublicMatchImages(matchId: string) {
  const images = await listMatchImages(matchId);
  return images.map(serializeImage);
}

export async function removeMatchImage(
  user: SessionUser,
  matchId: string,
  imageId: string,
) {
  const image = await findOwnedMatchImage(user.id, matchId, imageId);
  if (!image) {
    throw new MediaError(404, "image_not_found", "تصویر پیدا نشد");
  }

  try {
    await deleteStoredObject(image.objectKey);
  } catch (error) {
    if (!isStorageNotFound(error)) {
      throw new MediaError(502, "storage_unavailable", "حذف فایل از فضای ابری انجام نشد");
    }
  }
  await deleteMatchImageRecord(matchId, imageId);
}
