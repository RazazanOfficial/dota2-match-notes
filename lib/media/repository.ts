import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  journalMatches,
  matchImages,
  matchImageUploads,
} from "@/lib/db/schema";
import { MediaError } from "./errors";

const MAX_MATCH_IMAGES = 3;

interface ReservationInput {
  userId: string;
  matchId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: Date;
}

interface ConfirmedMetadata {
  width: number | null;
  height: number | null;
  altText: string;
  verifiedSizeBytes: number;
}

export async function reserveMatchImageUpload(input: ReservationInput) {
  const now = new Date();

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`match-images:${input.matchId}`}, 0))`,
    );

    const [ownedMatch] = await tx
      .select({ id: journalMatches.id })
      .from(journalMatches)
      .where(
        and(
          eq(journalMatches.id, input.matchId),
          eq(journalMatches.userId, input.userId),
        ),
      )
      .limit(1);
    if (!ownedMatch) {
      throw new MediaError(404, "match_not_found", "مچ پیدا نشد");
    }

    const expiredUploads = await tx
      .delete(matchImageUploads)
      .where(
        and(
          eq(matchImageUploads.userId, input.userId),
          eq(matchImageUploads.matchId, input.matchId),
          lte(matchImageUploads.expiresAt, now),
        ),
      )
      .returning({ objectKey: matchImageUploads.objectKey });
    const confirmed = await tx
      .select({ id: matchImages.id })
      .from(matchImages)
      .where(eq(matchImages.matchId, input.matchId));
    const pending = await tx
      .select({ id: matchImageUploads.id })
      .from(matchImageUploads)
      .where(
        and(
          eq(matchImageUploads.userId, input.userId),
          eq(matchImageUploads.matchId, input.matchId),
          gt(matchImageUploads.expiresAt, now),
        ),
      );

    if (confirmed.length + pending.length >= MAX_MATCH_IMAGES) {
      throw new MediaError(
        409,
        "image_limit_reached",
        "برای هر مچ حداکثر ۳ تصویر می‌توان ثبت کرد",
      );
    }

    const [reservation] = await tx
      .insert(matchImageUploads)
      .values(input)
      .returning();

    return {
      reservation,
      expiredObjectKeys: expiredUploads.map((item) => item.objectKey),
    };
  });
}

export async function findPendingMatchImage(
  userId: string,
  matchId: string,
  uploadId: string,
  objectKey: string,
) {
  const [upload] = await getDb()
    .select()
    .from(matchImageUploads)
    .where(
      and(
        eq(matchImageUploads.id, uploadId),
        eq(matchImageUploads.userId, userId),
        eq(matchImageUploads.matchId, matchId),
        eq(matchImageUploads.objectKey, objectKey),
      ),
    )
    .limit(1);

  return upload || null;
}

export async function findConfirmedMatchImageByKey(
  userId: string,
  matchId: string,
  objectKey: string,
) {
  const [image] = await getDb()
    .select({ image: matchImages })
    .from(matchImages)
    .innerJoin(journalMatches, eq(matchImages.matchId, journalMatches.id))
    .where(
      and(
        eq(matchImages.matchId, matchId),
        eq(matchImages.objectKey, objectKey),
        eq(journalMatches.userId, userId),
      ),
    )
    .limit(1);

  return image?.image || null;
}

export async function discardPendingMatchImage(
  userId: string,
  matchId: string,
  uploadId: string,
) {
  const [upload] = await getDb()
    .delete(matchImageUploads)
    .where(
      and(
        eq(matchImageUploads.id, uploadId),
        eq(matchImageUploads.userId, userId),
        eq(matchImageUploads.matchId, matchId),
      ),
    )
    .returning({ objectKey: matchImageUploads.objectKey });

  return upload || null;
}

export async function confirmMatchImage(
  userId: string,
  matchId: string,
  uploadId: string,
  objectKey: string,
  metadata: ConfirmedMetadata,
) {
  const now = new Date();

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`match-images:${matchId}`}, 0))`,
    );

    const [existing] = await tx
      .select({ image: matchImages })
      .from(matchImages)
      .innerJoin(journalMatches, eq(matchImages.matchId, journalMatches.id))
      .where(
        and(
          eq(matchImages.matchId, matchId),
          eq(matchImages.objectKey, objectKey),
          eq(journalMatches.userId, userId),
        ),
      )
      .limit(1);
    if (existing) return existing.image;

    const [upload] = await tx
      .select()
      .from(matchImageUploads)
      .where(
        and(
          eq(matchImageUploads.id, uploadId),
          eq(matchImageUploads.userId, userId),
          eq(matchImageUploads.matchId, matchId),
          eq(matchImageUploads.objectKey, objectKey),
          gt(matchImageUploads.expiresAt, now),
        ),
      )
      .limit(1);
    if (!upload) {
      throw new MediaError(410, "upload_expired", "مهلت تأیید آپلود تمام شده است");
    }

    const currentImages = await tx
      .select({ sortOrder: matchImages.sortOrder })
      .from(matchImages)
      .where(eq(matchImages.matchId, matchId))
      .orderBy(asc(matchImages.sortOrder));
    if (currentImages.length >= MAX_MATCH_IMAGES) {
      throw new MediaError(
        409,
        "image_limit_reached",
        "برای هر مچ حداکثر ۳ تصویر می‌توان ثبت کرد",
      );
    }

    const usedOrders = new Set(currentImages.map((image) => image.sortOrder));
    const sortOrder = [1, 2, 3].find((order) => !usedOrders.has(order));
    if (!sortOrder) {
      throw new MediaError(409, "image_order_unavailable", "جای خالی برای تصویر وجود ندارد");
    }

    const [image] = await tx
      .insert(matchImages)
      .values({
        matchId,
        objectKey: upload.objectKey,
        originalName: upload.originalName,
        mimeType: upload.mimeType,
        sizeBytes: metadata.verifiedSizeBytes,
        width: metadata.width,
        height: metadata.height,
        altText: metadata.altText,
        sortOrder,
      })
      .returning();
    await tx
      .delete(matchImageUploads)
      .where(eq(matchImageUploads.id, upload.id));

    return image;
  });
}

export async function listMatchImages(matchId: string) {
  const [match] = await getDb()
    .select({ id: journalMatches.id })
    .from(journalMatches)
    .where(eq(journalMatches.id, matchId))
    .limit(1);
  if (!match) throw new MediaError(404, "match_not_found", "مچ پیدا نشد");

  return getDb()
    .select()
    .from(matchImages)
    .where(eq(matchImages.matchId, matchId))
    .orderBy(asc(matchImages.sortOrder));
}

export async function findOwnedMatchImage(
  userId: string,
  matchId: string,
  imageId: string,
) {
  const [row] = await getDb()
    .select({ image: matchImages })
    .from(matchImages)
    .innerJoin(journalMatches, eq(matchImages.matchId, journalMatches.id))
    .where(
      and(
        eq(matchImages.id, imageId),
        eq(matchImages.matchId, matchId),
        eq(journalMatches.userId, userId),
      ),
    )
    .limit(1);

  return row?.image || null;
}

export async function deleteMatchImageRecord(matchId: string, imageId: string) {
  await getDb()
    .delete(matchImages)
    .where(and(eq(matchImages.id, imageId), eq(matchImages.matchId, matchId)));
}
