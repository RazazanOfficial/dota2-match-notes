import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getClient, isStorageNotFound } from "@/lib/storage/client";

export const REPLAY_MAX_BYTES = 200 * 1024 * 1024;
export const REPLAY_ROOT = "replays/";
export const validReplayKey = (key: string) => /^replays\/\d{4}\/\d{2}\/\d{2}\/\d+(?:_\d+)?\.dem(?:\.bz2)?$/.test(key);
export const validReplayFolder = (prefix: string) => /^replays\/(?:\d{4}\/)?(?:\d{2}\/)?(?:\d{2}\/)?$/.test(prefix);

export async function replayObjectHead(key: string) {
  if (!validReplayKey(key)) throw new Error("Invalid replay archive key");
  const { client, config } = getClient();
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
    if (!result.ContentLength || result.ContentLength > REPLAY_MAX_BYTES) throw new Error("Invalid archived replay size");
    return { bytes: result.ContentLength, sha256: result.Metadata?.sha256 || null };
  } catch (error) {
    if (isStorageNotFound(error)) return null;
    throw error;
  }
}

export async function replayObjectStream(key: string) {
  if (!validReplayKey(key)) throw new Error("Invalid replay archive key");
  const { client, config } = getClient();
  return client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(360_000) });
}

export async function listReplayFolder(prefix: string, continuationToken?: string) {
  if (!validReplayFolder(prefix)) throw new Error("Invalid replay folder");
  const { client, config } = getClient();
  const result = await client.send(new ListObjectsV2Command({
    Bucket: config.bucket, Prefix: prefix, Delimiter: "/", MaxKeys: 100,
    ContinuationToken: continuationToken,
  }), { abortSignal: AbortSignal.timeout(20_000) });
  return {
    folders: (result.CommonPrefixes || []).flatMap((entry) => entry.Prefix && validReplayFolder(entry.Prefix) ? [entry.Prefix] : []),
    files: (result.Contents || []).flatMap((entry) => entry.Key && validReplayKey(entry.Key) ? [{ key: entry.Key, bytes: entry.Size || 0 }] : []),
    nextToken: result.IsTruncated ? result.NextContinuationToken || null : null,
  };
}

export async function deleteReplayObject(key: string) {
  // Folder deletion also removes S3 directory markers and legacy sidecars.
  if (!key.startsWith(REPLAY_ROOT) || key === REPLAY_ROOT || key.includes("..") || !/^replays\/[a-zA-Z0-9_./-]+$/.test(key)) throw new Error("Invalid replay archive key");
  const { client, config } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(25_000) });
}

export async function listReplayObjects(prefix: string) {
  if (!validReplayFolder(prefix)) throw new Error("Invalid replay folder");
  const { client, config } = getClient();
  return client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, MaxKeys: 100 }), { abortSignal: AbortSignal.timeout(20_000) });
}
