import { z } from "zod";
import { IMAGE_MIME_TYPES } from "../storage/media";

const safeFileName = z
  .string()
  .trim()
  .min(1, "نام فایل خالی است")
  .max(255, "نام فایل بیش از حد طولانی است")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "نام فایل نامعتبر است");

export function parsePresignInput(input: unknown, maxImageBytes: number) {
  return z
    .object({
      fileName: safeFileName,
      contentType: z.enum(IMAGE_MIME_TYPES),
      size: z.number().int().positive().max(maxImageBytes),
    })
    .strict()
    .parse(input);
}

export const confirmImageSchema = z
  .object({
    uploadId: z.string().uuid(),
    objectKey: z.string().min(1).max(1_024),
    width: z.number().int().positive().max(20_000).nullable().optional(),
    height: z.number().int().positive().max(20_000).nullable().optional(),
    altText: z.string().trim().max(500).optional().default(""),
  })
  .strict();

export function parseUuid(value: string) {
  return z.string().uuid().safeParse(value);
}
