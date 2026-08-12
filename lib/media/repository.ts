import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { journalMatches, matchImages } from "@/lib/db/schema";
import { MediaError } from "./errors";

export interface GeneratedImageRecordInput {
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  altText: string;
  sortOrder: number;
}

export async function replaceGeneratedMatchImages(
  matchId: string,
  generated: GeneratedImageRecordInput[],
) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`match-images:${matchId}`}, 0))`,
    );

    const [match] = await tx
      .select({ id: journalMatches.id })
      .from(journalMatches)
      .where(eq(journalMatches.id, matchId))
      .limit(1);
    if (!match) {
      throw new MediaError(404, "match_not_found", "مچ پیدا نشد");
    }

    const previous = await tx
      .select({ objectKey: matchImages.objectKey })
      .from(matchImages)
      .where(eq(matchImages.matchId, matchId));

    await tx.delete(matchImages).where(eq(matchImages.matchId, matchId));
    const images = await tx
      .insert(matchImages)
      .values(
        generated.map((image) => ({
          matchId,
          ...image,
        })),
      )
      .returning();

    await tx
      .update(journalMatches)
      .set({
        generatedImageKey: images[0]?.objectKey || null,
        generatedImageAt: new Date(),
      })
      .where(eq(journalMatches.id, matchId));

    return {
      images,
      previousObjectKeys: previous.map((image) => image.objectKey),
    };
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
