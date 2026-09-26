import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MAX_REPLAY_BYTES } from "./replay-queue-utils.mjs";

export function replayArchiveKey(startedAt, descriptor) {
  const time = new Date(startedAt);
  if (!Number.isFinite(time.getTime()) || time.getUTCFullYear() < 2020 ||
    !/^\d+_\d+\.dem\.bz2$/.test(descriptor.filename)) throw new Error("Invalid replay archive date or filename");
  return `replays/${time.toISOString().slice(0, 10).replaceAll("-", "/")}/${descriptor.filename.split("_")[0]}.dem.bz2`;
}

export async function archivedReplayExists(key, expectedBytes) {
  if (!/^replays\/\d{4}\/\d{2}\/\d{2}\/\d+(?:_\d+)?\.dem(?:\.bz2)?$/.test(key)) throw new Error("Invalid archived replay reference");
  const { client, bucket } = storage();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
    if (head.ContentLength !== expectedBytes || !/^[0-9a-f]{64}$/.test(head.Metadata?.sha256 || "")) throw new Error("Archived replay metadata does not match the database");
    return true;
  } catch (error) {
    if (error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return false;
    throw error;
  } finally { client.destroy(); }
}

function storage() {
  const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing env: ${name}`);
    return value;
  };
  const rawEndpoint = required("CLOUD_SPACE_END_POINT_URL");
  const endpoint = new URL(/^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`);
  if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Invalid replay storage endpoint");
  }
  const bucket = required("CLOUD_SPACE_BUCKET");
  if (bucket.includes("/") || bucket.includes("://")) throw new Error("Invalid replay storage bucket");
  const client = new S3Client({
    endpoint: endpoint.toString(),
    region: process.env.CLOUD_SPACE_REGION?.trim() || "us-east-1",
    forcePathStyle: process.env.CLOUD_SPACE_FORCE_PATH_STYLE !== "false",
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: required("CLOUD_SPACE_ACCESS_KEY"), secretAccessKey: required("CLOUD_SPACE_SECRET_KEY") },
    maxAttempts: 2,
  });
  return { client, bucket };
}

export async function uploadReplay(path, key) {
  const details = await lstat(path);
  if (!details.isFile() || details.size < 8 || details.size > MAX_REPLAY_BYTES) throw new Error("Invalid replay archive input");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const { client, bucket } = storage();
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: createReadStream(path), ContentLength: details.size,
      ContentType: "application/octet-stream", CacheControl: "private, no-store",
      Metadata: { sha256 },
    }), { abortSignal: AbortSignal.timeout(360_000) });
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
    if (head.ContentLength !== details.size || head.Metadata?.sha256 !== sha256) {
      throw new Error("Replay archive verification failed");
    }
    return { key, bytes: details.size };
  } finally { client.destroy(); }
}

export async function retrieveReplay(key, expectedBytes, directory) {
  if (!/^replays\/\d{4}\/\d{2}\/\d{2}\/\d+(?:_\d+)?\.dem(?:\.bz2)?$/.test(key) ||
    !Number.isInteger(expectedBytes) || expectedBytes < 8 || expectedBytes > MAX_REPLAY_BYTES) {
    throw new Error("Invalid archived replay reference");
  }
  const { client, bucket } = storage();
  const temporary = join(directory, `.replay-${randomUUID()}.part`);
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(360_000) });
    if (!result.Body || result.ContentLength !== expectedBytes) {
      result.Body?.destroy?.();
      throw new Error("Archived replay size does not match the database");
    }
    let bytes = 0;
    const hash = createHash("sha256");
    await pipeline(result.Body, new Transform({ transform(chunk, _, done) {
      bytes += chunk.length;
      hash.update(chunk);
      done(bytes > MAX_REPLAY_BYTES ? new Error("Archived replay exceeds size limit") : null, chunk);
    } }), createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    if (bytes !== expectedBytes || !/^[0-9a-f]{64}$/.test(result.Metadata?.sha256 || "") ||
      hash.digest("hex") !== result.Metadata.sha256) throw new Error("Archived replay checksum mismatch");
    return temporary;
  } catch (error) { await rm(temporary, { force: true }); throw error; }
  finally { client.destroy(); }
}
