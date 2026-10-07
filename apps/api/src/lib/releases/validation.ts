import { z } from "zod";

function hasSafeTree(document: { content?: unknown[] }) {
  const stack = (document.content || []).map((node) => ({ node, depth: 1 }));
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    if (!current || !current.node || typeof current.node !== "object") return false;
    if (++count > 1_000 || current.depth > 20) return false;
    const content = (current.node as { content?: unknown }).content;
    if (content !== undefined && !Array.isArray(content)) return false;
    for (const child of content || []) stack.push({ node: child, depth: current.depth + 1 });
  }
  return true;
}

const tiptapDocument = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.unknown()).max(500).optional().default([]),
  })
  .passthrough()
  .refine((document) => JSON.stringify(document).length <= 100_000, "متن Release Notes بیش از حد بزرگ است")
  .refine(hasSafeTree, "ساختار Release Notes معتبر نیست");

export const releaseInputSchema = z
  .object({
    version: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9._-]+$/),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().max(500).default(""),
    content: tiptapDocument,
    status: z.enum(["draft", "published"]),
  })
  .strict();

export const releaseIdSchema = z.string().uuid();
export type ReleaseInput = z.infer<typeof releaseInputSchema>;
